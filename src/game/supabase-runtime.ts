import { createHash } from 'node:crypto'
import { applyCommand, type EngineEnv } from './engine'
import type { Revision } from './commit'
import type { CommandResult, GameCommand } from './types'
import type { RuntimeCatalog } from './supabase-catalog'

const fields: Record<string, string[]> = {
  join: ['name', 'demo'],
  expire: [],
  daily: [],
  claimQuest: ['quest'],
  spin: ['tier'],
  createBattle: ['packs', 'seats', 'mode', 'expectedPrice', 'expectedCatalog'],
  joinBattle: ['battle', 'expectedPrice'],
  cancelBattle: ['battle'],
  plinko: ['bet'],
  blackjack: ['bet'],
  blackjackHit: ['hand'],
  blackjackStand: ['hand'],
  tick: [],
  open: ['pack', 'count', 'expectedPrice', 'expectedCatalog'],
  quickSell: ['cards', 'expectedQsv'],
  quickSellDuplicates: ['quote'],
  list: ['card', 'price'],
  cancelListing: ['listing'],
  editListing: ['listing', 'price'],
  buy: ['listing', 'price'],
  settings: ['name', 'hidden', 'notifications', 'privateCollection', 'spendLimit'],
  trade: ['to', 'fromCards', 'toCards', 'fromCoins', 'toCoins'],
  editTrade: ['trade', 'to', 'fromCards', 'toCards', 'fromCoins', 'toCoins'],
  acceptTrade: ['trade', 'revision'],
  cancelTrade: ['trade', 'revision'],
  declineTrade: ['trade', 'revision'],
  grade: ['card', 'expectedFee', 'confirm'],
  display: ['card', 'confirm'],
  claimDisplay: [],
  withdrawDisplay: [],
  job: ['task', 'confirm'],
  createAuction: ['card', 'startingBid', 'seconds', 'confirm'],
  cancelAuction: ['auction'],
  bid: ['auction', 'amount', 'confirm'],
  createStorage: ['tier'],
  joinStorage: ['auction'],
  openRewardPack: ['reward'],
  chat: ['body'],
  reportChat: ['message'],
  moderateChat: ['message', 'reason'],
  admin: ['target', 'operation', 'amount', 'card', 'design', 'designRevision', 'quantity', 'attributes', 'reason', 'confirmation'],
  economyUpgrade: ['reason', 'confirmation'],
}
export function normalizeCommand(input: GameCommand): GameCommand {
  if (
    !input ||
    typeof input.action !== 'string' ||
    !Object.hasOwn(fields, input.action) ||
    typeof input.key !== 'string' ||
    !/^[a-zA-Z0-9:_-]{8,120}$/.test(input.key)
  )
    throw new Error('Invalid game command or request key.')
  return Object.fromEntries(
    ['action', 'key', ...fields[input.action]]
      .filter((key) => Object.hasOwn(input, key))
      .map((key) => [key, input[key]]),
  ) as GameCommand
}
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    )
  return value
}
export function commandHash(actor: string, command: GameCommand) {
  const { key: _key, ...body } = normalizeCommand(command)
  return createHash('sha256')
    .update(JSON.stringify(canonical({ actor, command: body })))
    .digest('hex')
}
export type StoredReceipt = {
  actor: string
  action: string
  request_hash: string
  result: CommandResult
}
export type RuntimeTransport = {
  read: () => Promise<Revision>
  receipt: (key: string) => Promise<StoredReceipt | null>
  catalog: () => Promise<RuntimeCatalog>
  append: (
    input: Revision & {
      actor: string
      command: GameCommand
      hash: string
      result: CommandResult
      catalog: RuntimeCatalog
    },
  ) => Promise<CommandResult>
}

export async function commitRuntime(
  transport: RuntimeTransport,
  actor: string,
  input: GameCommand,
  environment:
    | Pick<EngineEnv, 'now' | 'random' | 'uuid' | 'operator'>
    | (() => Pick<EngineEnv, 'now' | 'random' | 'uuid' | 'operator'>),
) {
  const command = normalizeCommand(input),
    hash = commandHash(actor, command)
  for (let attempt = 0; attempt < 16; attempt++) {
    const current = await transport.read()
    const receipt = await transport.receipt(command.key)
    if (receipt) {
      if (
        receipt.actor !== actor ||
        receipt.action !== command.action ||
        receipt.request_hash !== hash
      )
        throw new Error('That request key belongs to a different player or command.')
      return receipt.result
    }
    const catalog = await transport.catalog()
    if (['open', 'createBattle'].includes(command.action) && command.expectedCatalog != null &&
        command.expectedCatalog !== catalog.revision)
      throw new Error('Pack contents or odds changed. Close the confirmation and review the refreshed catalog before opening.')
    const env = typeof environment === 'function' ? environment() : environment
    const applied = applyCommand(current.state, actor, command, {
      ...env,
      rules: catalog.rules,
      packs: catalog.packs,
      designs: catalog.designs,
    })
    if (applied.state === current.state) return applied.result
    try {
      return await transport.append({
        sequence: current.sequence + 1,
        state: applied.state,
        result: applied.result,
        actor,
        command,
        hash,
        catalog,
      })
    } catch (error) {
      // Only explicit serialization failures are safe to reroll/revalidate.
      if ((error as { code?: string }).code !== '40001') throw error
    }
  }
  throw new Error('The economy is busy. Please retry the same request in a moment.')
}
