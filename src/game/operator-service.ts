import 'server-only'
import { randomUUID } from 'node:crypto'
import { serviceClient, BackendUnavailable } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/app-auth'
import { latestWorld } from './repository'
import { getCatalog } from './catalog'
import { applyCommand } from './engine'
import { commandHash } from './supabase-runtime'
import { encodeSnapshot, decodeSnapshot } from './snapshot'
import { intermediatePacks, upgradeMarker, upgradePreview, upgradedRules } from './economy-update'
import { validateCase, validateDesign, StudioError } from './authoring'
import { validateRules, type Rules, type PackOdds } from './rules'
import { caseUsage } from './case-usage'

export function studioDatabaseError(error: { code?: string; message?: string }): never {
  if (error.code === 'PGRST202') throw new BackendUnavailable('Apply 20261119000100_vault_studio.sql before using the studio.')
  if (error.code === '40001') throw new StudioError({ revision: 'This record or economy changed. Reload/preview again before saving.' })
  if (error.code === '23505') throw new StudioError({ slug: 'That slug, release namespace or version already exists. Choose a new one.' })
  throw new StudioError({ database: error.message || 'Supabase rejected this change. No partial operation was saved.' })
}
async function allRows(table: string, sort: string) {
  const rows: Record<string, any>[] = [], client = serviceClient()
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await client.from(table).select('*').order(sort).range(offset, offset + 199)
    if (error) throw new BackendUnavailable('The Supabase studio catalog could not be loaded.')
    rows.push(...(data ?? []))
    if (!data || data.length < 200) return rows
  }
}
export async function loadStudio(economyAccess: boolean) {
  const [cases, designs, configurations, pools, current, capability] = await Promise.all([
    allRows('vault_cases', 'slug'), allRows('vault_card_designs','slug'),
    allRows('vault_configurations','created_at'), allRows('vault_case_pool','case_id'),
    economyAccess ? latestWorld() : null,
    serviceClient().rpc('vault_released_editing_version'),
  ])
  const rules = configurations.find((c) => c.active && c.status === 'published')?.rules as Rules | undefined
  if (!rules || !validateRules(rules)) throw new BackendUnavailable('Publish one valid active configuration before using the studio.')
  return {
    releasedEditing: capability.data === '1',
    cases: cases.map((c) => ({ ...c,
      usage: current ? caseUsage(current.state,c.id,c.cards_per_opening,c.serial_scope) : undefined,
      pool: pools.filter((p) => p.case_id === c.id).map((p) => ({ design_id: p.design_id, weight: Number(p.weight) })) })),
    designs, configurations: configurations.map((c) => ({ id:c.id,name:c.name,version:c.version,status:c.status,active:c.active })),
    rules,
    players: current ? Object.values(current.state.players).filter((p) => !p.demo).map((p) => ({
      id:p.id,name:p.name,balance:p.balance,suspended:!!p.suspended,
      cards:Object.values(current.state.cards).filter((c) => c.owner===p.id && c.status!=='burned').length,
    })) : [],
  }
}
export async function saveStudio(user: AppUser, input: Record<string, any>) {
  const active = await serviceClient().from('vault_configurations').select('rules').eq('active',true).eq('status','published').maybeSingle()
  const rules = active.data?.rules as Rules
  if (active.error || !rules || !validateRules(rules)) throw new BackendUnavailable('The active value rules could not be loaded.')
  const entity = input.action === 'saveDesign' ? 'design' : 'case'
  const id = input.id == null ? null : input.id
  if (id !== null && (typeof id !== 'string' || id.length > 160)) throw new StudioError({ id:'Choose a valid saved record.' })
  if (id !== null && !Number.isSafeInteger(input.revision)) throw new StudioError({ revision:'Reload the record before saving.' })
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 2000)
    throw new StudioError({ reason:'Enter an audit reason of 5–2000 characters.' })
  const current = entity === 'case' && id ? await latestWorld(user) : null
  const existing = current ? await serviceClient().from('vault_cases').select('cards_per_opening,serial_scope').eq('id',id).single() : null
  if (existing?.error) throw new StudioError({ id:'The saved case could not be read.' })
  const usage = current && existing?.data ? caseUsage(current.state,id,existing.data.cards_per_opening,existing.data.serial_scope) : undefined
  const validated = entity === 'design' ? { data:validateDesign(input.data,rules),pool:[] } : validateCase(input.data,input.pool,usage)
  const { data,error } = await serviceClient().rpc(current ? 'vault_studio_save_released' : 'vault_studio_save', {
    p_user_id:user.id,p_entity:entity,p_id:id,p_expected_revision:id ? input.revision : null,
    p_data:validated.data,p_pool:validated.pool,p_reason:input.reason.trim(),
    ...(current ? { p_expected_sequence:current.sequence,p_usage:usage } : {}),
  })
  if (error?.code === 'PGRST202' && current) throw new BackendUnavailable('Apply 20261120000100_vault_released_pack_editing.sql before saving existing packs.')
  if (error) studioDatabaseError(error)
  return usage ? { ...data,usage } : data
}
export async function previewEconomy22(user: AppUser) {
  const [world,catalog,cases] = await Promise.all([latestWorld(user),getCatalog(),allRows('vault_cases','slug')])
  const preview = upgradePreview(world.state)
  const packs = preview.applied ? [] : intermediatePacks(cases as {slug:string;odds:PackOdds}[])
  return { ...preview,sequence:world.sequence,revision:catalog.revision,rules:upgradedRules(catalog.rules),packs }
}
export async function activateEconomy22(user: AppUser, input: Record<string, any>) {
  if (input.confirmation !== 'CONFIRM' || typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 2000)
    throw new StudioError({ confirmation:'Type CONFIRM and enter an audit reason.' })
  const [world,catalog,cases] = await Promise.all([latestWorld(user),getCatalog(),allRows('vault_cases','slug')])
  if (world.state.counters[upgradeMarker]) return { message:'Economy 2.2 was already activated. No duplicate credits were granted.' }
  if (world.sequence !== input.sequence || catalog.revision !== input.revision)
    throw new StudioError({ revision:'The economy changed since your preview. Preview again before applying.' })
  const command = { action:'economyUpgrade',key:upgradeMarker,reason:input.reason.trim(),confirmation:'CONFIRM' }
  const { state,result } = applyCommand(world.state,user.playerId,command,{
    now:Date.now(),random:()=>0,uuid:randomUUID,operator:true,rules:catalog.rules,packs:catalog.packs,designs:catalog.designs,
  })
  const snapshot = encodeSnapshot(state)
  decodeSnapshot(snapshot)
  const { data,error } = await serviceClient().rpc('vault_activate_economy22',{
    p_user_id:user.id,p_actor:user.playerId,p_expected_sequence:world.sequence,p_catalog_revision:catalog.revision,
    p_snapshot:snapshot,p_result:result,p_request_hash:commandHash(user.playerId,command),
    p_rules:upgradedRules(catalog.rules),p_packs:intermediatePacks(cases as {slug:string;odds:PackOdds}[]),p_reason:input.reason.trim(),
  })
  if (error) studioDatabaseError(error)
  return data
}
