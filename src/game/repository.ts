import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { serviceClient, BackendUnavailable } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/app-auth'
import { getCatalog } from './catalog'
import { decodeSnapshot, encodeSnapshot } from './snapshot'
import { emptyWorld, type CommandResult, type GameCommand } from './types'
import { commitRuntime, type StoredReceipt } from './supabase-runtime'

async function readEconomy(sequence?: number) {
  const client = serviceClient()
  const current = await client.rpc('vault_read_economy', { p_sequence: sequence ?? null }).maybeSingle<{
    sequence: number
    snapshot: unknown
  }>()
  if (!current.error) return current.data
  // Deploy this app before the cutover. Once cut over, revoked legacy reads
  // fail closed even if an old API schema cache still reports a missing RPC.
  if (current.error.code !== 'PGRST202')
    throw new BackendUnavailable('Supabase economy storage could not be loaded.')
  const query = client.from('vault_economy_commits').select('sequence,snapshot')
  const legacy = await (sequence == null
    ? query.order('sequence', { ascending: false }).limit(1)
    : query.eq('sequence', sequence)).maybeSingle()
  if (legacy.error) throw new BackendUnavailable('Supabase economy storage could not be loaded.')
  if (legacy.data || sequence != null) return legacy.data
  const head = await client.from('vault_economy_head').select('last_sequence').eq('singleton', true).single()
  if (head.error || head.data?.last_sequence !== 0)
    throw new BackendUnavailable('The economy has no current snapshot. Do not reset it or grant new balances.')
  return { sequence: 0, snapshot: null }
}

export async function latestWorld(_user?: AppUser | null) {
  const world = await readEconomy()
  if (!world || !Number.isSafeInteger(world.sequence) || world.sequence < 0 ||
      (world.snapshot == null) !== (world.sequence === 0))
    throw new BackendUnavailable('The economy head is missing or inconsistent.')
  return { state: world.snapshot == null ? emptyWorld() : decodeSnapshot(world.snapshot), sequence: world.sequence }
}

export async function previewEconomySnapshot(sequence: number) {
  const world = await readEconomy(sequence)
  if (!world) throw new Error('The requested economy snapshot is not retained. Only the current World is saved after the storage cutover.')
  if (world.snapshot && typeof world.snapshot === 'object' && '_vault_compacted_snapshot' in world.snapshot)
    throw new Error('The requested economy snapshot was compacted.')
  return decodeSnapshot(world.snapshot)
}

async function readEconomyReceipt(client: ReturnType<typeof serviceClient>, key: string) {
  const receipt = await client.rpc('vault_read_economy_receipt', { p_key: key }).maybeSingle<StoredReceipt>()
  if (!receipt.error) return receipt.data
  if (receipt.error.code === 'PGRST202') {
    const legacy = await client.from('vault_economy_commits')
      .select('actor,action,request_hash,result').eq('idempotency_key', key).maybeSingle<StoredReceipt>()
    if (!legacy.error) return legacy.data
  }
  throw new BackendUnavailable('The request receipt could not be checked.')
}
export async function operatorRole(user: AppUser | null) {
  if (!user) return null
  const { data, error } = await serviceClient()
    .from('vault_operator_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new BackendUnavailable('Supabase operator permissions could not be checked.')
  return typeof data?.role === 'string' ? data.role : null
}
export async function commitCommand(user: AppUser, command: GameCommand) {
  if (['admin','moderateChat','economyUpgrade'].includes(command.action))
    throw new Error('Use the role-protected operator endpoint for staff commands.')
  if (['open', 'createBattle'].includes(command.action) && (typeof command.expectedCatalog !== 'string' ||
      !/^[0-9a-f]{32}$/.test(command.expectedCatalog) || !Number.isSafeInteger(command.expectedPrice)))
    throw new Error('Review the current pack price and odds before confirming an opening.')
  // A client cannot pick its identity, welcome amount or operator permissions.
  if (command.action === 'join') {
    if ((await latestWorld(user)).state.players[user.playerId]) return { message: 'Welcome back' }
    command = { action: 'join', key: `join:${user.id}`, name: user.displayName, demo: false }
  }
  return commit(user, command, false)
}
export async function commitOperator(
  user: AppUser | { id: string | number },
  command: GameCommand,
) {
  if (!('playerId' in user))
    throw new Error('Legacy Payload support tools cannot modify the Supabase game.')
  const role = await operatorRole(user)
  if (!['owner', 'operator', 'economy'].includes(role ?? ''))
    throw new Error('A Supabase economy operator role is required.')
  return commit(user, command, true)
}
async function commit(user: AppUser, command: GameCommand, operator: boolean) {
  const client = serviceClient()
  return commitRuntime(
    {
      read: () => latestWorld(user),
      catalog: getCatalog,
      receipt: (key) => readEconomyReceipt(client, key),
      append: async ({ sequence, state, result, actor, command: normalized, hash, catalog }) => {
        const snapshot = encodeSnapshot(state)
        decodeSnapshot(snapshot)
        const { data, error } = await client.rpc('vault_commit_game', {
          p_user_id: user.id,
          p_expected_sequence: sequence - 1,
          p_idempotency_key: normalized.key,
          p_actor: actor,
          p_action: normalized.action,
          p_request_hash: hash,
          p_snapshot: snapshot,
          p_result: result,
          p_formula_version: catalog.rules.version,
          p_catalog_revision: catalog.revision,
          p_opened_case_id: normalized.action === 'open' ? String(normalized.pack) : null,
        })
        if (error?.code === '40001')
          throw Object.assign(new Error('Catalog/economy changed.'), { code: '40001' })
        if (error)
          throw new BackendUnavailable(
            'The Supabase commit was not confirmed. Retry the same request; do not create a new one.',
          )
        if (!data?.[0]?.result) throw new BackendUnavailable('Supabase returned no commit receipt.')
        return data[0].result as CommandResult
      },
    },
    user.playerId,
    command,
    () => ({
      now: Date.now(),
      random: () => randomInt(0, 0x100000000) / 0x100000000,
      uuid: randomUUID,
      operator,
    }),
  )
}
