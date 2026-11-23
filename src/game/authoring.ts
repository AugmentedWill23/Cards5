import { mutations, qualities, rarities, validateOdds, type Rules, type PackOdds } from './rules'
import { visualEffects, visualFinishes, visualThemes } from './visuals'
import type { CaseUsage } from './case-usage'

export const studioColors = ['violet', 'blue', 'emerald', 'amber', 'rose'] as const
export class StudioError extends Error {
  constructor(public fields: Record<string, string>) { super(Object.values(fields)[0]); this.name = 'StudioError' }
}
type Data = Record<string, any>
const invalid = (field: string, message: string): never => { throw new StudioError({ [field]: message }) }
function object(value: unknown, field: string): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field, `${field} must be an object.`)
  return value as Data
}
function keys(value: Data, allowed: string[], field: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(field, `${field} contains unsupported fields.`)
}
function text(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max ||
      /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) invalid(field, `${field} needs ${min}–${max} printable characters.`)
  return (value as string).trim()
}
function choice(value: unknown, field: string, options: readonly string[]) {
  if (typeof value !== 'string' || !options.includes(value)) invalid(field, `Choose a valid ${field}.`)
  return value as string
}
function integer(value: unknown, field: string, min: number, max: number, nullable = false) {
  if (nullable && value == null) return null
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    invalid(field, `${field} must be a whole number from ${min} to ${max}.`)
  return value as number
}
function slug(value: unknown, field = 'slug') {
  const parsed = text(value, field, 1, 160)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(parsed)) invalid(field, 'Use lowercase words separated by hyphens.')
  return parsed
}
function date(value: unknown, field: string) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)))
    invalid(field, `${field} must include a valid timezone.`)
  return new Date(value as string).toISOString()
}
function visual(value: unknown, rarityColor = false) {
  const v = value == null ? {} : object(value, 'visual_config')
  keys(v, ['color', 'theme', 'finish', 'vfx', 'effectName', 'mutationName'], 'visual_config')
  const color = v.color ?? (rarityColor ? 'rarity' : 'violet')
  if (typeof color !== 'string' || !(studioColors.includes(color as typeof studioColors[number]) ||
      (rarityColor && color === 'rarity') || /^#[0-9a-fA-F]{6}$/.test(color)))
    invalid('color', 'Choose a palette color or a six-digit hex color.')
  return { color,
    ...(v.theme == null ? {} : { theme: choice(v.theme, 'theme', visualThemes) }),
    ...(v.finish == null ? {} : { finish: choice(v.finish, 'finish', visualFinishes) }),
    ...(v.vfx == null ? {} : { vfx: choice(v.vfx, 'vfx', visualEffects) }),
    ...(v.effectName == null ? {} : { effectName: text(v.effectName, 'effectName', 0, 80) }),
    ...(v.mutationName == null ? {} : { mutationName: text(v.mutationName, 'mutationName', 0, 80) }),
  }
}
export function validateDesign(input: unknown, rules: Rules) {
  const d = object(input, 'design')
  keys(d, ['slug','name','description','rarity','enabled','availability','base_value_override','default_attributes','visual_config'], 'design')
  if (d.enabled != null && typeof d.enabled !== 'boolean') invalid('enabled', 'Enabled must be true or false.')
  const defaults = d.default_attributes == null ? {} : object(d.default_attributes, 'default_attributes')
  keys(defaults, ['quality','grade','mutation','effect'], 'default_attributes')
  if (Object.hasOwn(defaults, 'quality')) choice(defaults.quality, 'quality', qualities)
  if (Object.hasOwn(defaults, 'grade')) integer(defaults.grade, 'grade', 1, 10, true)
  if (defaults.mutation != null) {
    choice(defaults.mutation, 'mutation', mutations)
    if (rules.mutation[defaults.mutation] == null) invalid('mutation', 'This mutation is not configured in the active value rules.')
  }
  if (defaults.effect != null) {
    const effect = rules.effects[String(defaults.effect)]
    if (!effect || effect.enabled === false || effect.archived) invalid('effect', 'Choose an enabled special effect.')
  }
  return {
    slug: slug(d.slug), name: text(d.name, 'name', 2, 80), description: text(d.description ?? '', 'description', 0, 2000),
    rarity: choice(d.rarity, 'rarity', rarities), enabled: d.enabled !== false,
    availability: choice(d.availability ?? 'standard', 'availability', ['standard','assigned-only','limited-only']),
    base_value_override: integer(d.base_value_override ?? null, 'base_value_override', 1, 1e12, true),
    default_attributes: defaults, visual_config: visual(d.visual_config, true),
  }
}
export function validateCase(input: unknown, poolInput: unknown, usage?: CaseUsage) {
  const d = object(input, 'case')
  keys(d, ['slug','name','subtitle','kind','status','price','cards_per_opening','pool_mode','odds','configuration_id',
    'starts_at','ends_at','max_total_openings','max_distinct_players','per_player_limit',
    'per_player_daily_limit','cooldown_seconds','edition_cap','serial_scope','perfect_qualifying_tier','visual_config'], 'case')
  const kind = choice(d.kind ?? 'standard', 'kind', ['standard','limited'])
  const poolMode = choice(d.pool_mode ?? 'rarity', 'pool_mode', ['rarity','assigned'])
  const odds = object(d.odds, 'odds') as PackOdds
  keys(odds, ['rarity','quality','grade','mutation','effect'], 'odds')
  if (!validateOdds(odds)) invalid('odds', 'Rarity and quality weights must total 100%; optional chances must be 0–100%.')
  const parsedSlug = slug(d.slug), count = integer(d.cards_per_opening, 'cards_per_opening', 1, 5)!
  const stock = integer(d.max_total_openings ?? null, 'max_total_openings', 1, 1e12, true)
  const distinct = integer(d.max_distinct_players ?? null, 'max_distinct_players', 1, 1e12, true)
  const lifetime = integer(d.per_player_limit ?? null, 'per_player_limit', 1, 1e9, true)
  const daily = integer(d.per_player_daily_limit ?? null, 'per_player_daily_limit', 1, 1e9, true)
  const edition = integer(d.edition_cap ?? null, 'edition_cap', 1, Number.MAX_SAFE_INTEGER, true)
  const starts = date(d.starts_at, 'starts_at'), ends = date(d.ends_at, 'ends_at')
  if (starts && ends && starts >= ends) invalid('ends_at', 'The end must be after the start.')
  if (stock != null && distinct != null && distinct > stock) invalid('max_distinct_players', 'Distinct-player cap cannot exceed total stock.')
  if (lifetime != null && daily != null && daily > lifetime) invalid('per_player_daily_limit', 'Daily limit cannot exceed lifetime limit.')
  if (kind === 'limited' && !stock && !ends) invalid('ends_at', 'Limited releases need an end time or total stock.')
  if (stock != null && stock < (usage?.openings ?? 0)) invalid('max_total_openings', 'Stock cannot be lower than openings already used.')
  if (distinct != null && distinct < (usage?.distinct ?? 0)) invalid('max_distinct_players', 'The distinct-player cap cannot be lower than existing participation.')
  if (lifetime != null && lifetime < (usage?.maxLifetime ?? 0)) invalid('per_player_limit', 'The lifetime limit cannot be lower than a player’s existing usage.')
  if (daily != null && daily < (usage?.maxDaily ?? 0)) invalid('per_player_daily_limit', 'The daily limit cannot be lower than a player’s usage today.')
  const editionSupply = (usage?.minted ?? 0) + ((stock ?? 0) - (usage?.openings ?? 0)) * count
  if (edition != null && (kind !== 'limited' || stock == null || edition !== editionSupply))
    invalid('edition_cap', 'Edition cap must equal cards already minted + remaining openings × new cards per opening.')
  const pool: { design_id: string; weight: number }[] = []
  if (poolMode === 'assigned') {
    if (!Array.isArray(poolInput) || !poolInput.length || poolInput.length > 200) invalid('pool', 'Assign 1–200 different designs.')
    for (const entry of poolInput as unknown[]) {
      const e = object(entry, 'pool'); keys(e, ['design_id','weight'], 'pool')
      const id = text(e.design_id, 'design_id', 1, 160)
      if (typeof e.weight !== 'number' || !Number.isFinite(e.weight) || e.weight <= 0 || e.weight > 100 ||
          Math.abs(e.weight * 1e6 - Math.round(e.weight * 1e6)) > 1e-6) invalid('pool', 'Use positive weights with at most six decimals.')
      pool.push({ design_id: id, weight: e.weight })
    }
    if (new Set(pool.map((e) => e.design_id)).size !== pool.length ||
        Math.abs(pool.reduce((sum, e) => sum + e.weight, 0) - 100) > 1e-7)
      invalid('pool', 'Choose unique designs whose weights total 100%.')
  }
  return { data: {
    slug: parsedSlug, name: text(d.name, 'name', 2, 100), subtitle: text(d.subtitle ?? '', 'subtitle', 0, 500),
    kind, status: choice(d.status ?? 'draft', 'status', ['draft','published','paused','archived']),
    price: integer(d.price, 'price', 1, 1e12), cards_per_opening: count, pool_mode: poolMode, odds,
    configuration_id: d.configuration_id == null || d.configuration_id === '' ? null : text(d.configuration_id, 'configuration_id', 1, 160),
    starts_at: starts, ends_at: ends, max_total_openings: stock, max_distinct_players: distinct,
    per_player_limit: lifetime, per_player_daily_limit: daily,
    cooldown_seconds: integer(d.cooldown_seconds ?? 0, 'cooldown_seconds', 0, 86400),
    edition_cap: kind === 'limited' ? edition : null,
    serial_scope: kind === 'limited' ? slug(d.serial_scope ?? parsedSlug, 'serial_scope') : null,
    perfect_qualifying_tier: kind === 'limited' && d.perfect_qualifying_tier
      ? choice(d.perfect_qualifying_tier, 'perfect_qualifying_tier', rarities.slice(7)) : null,
    visual_config: visual(d.visual_config),
  }, pool }
}
