import { validateOdds, validateRules, type Rules } from './rules'
import type { CardDesign, GameView, Pack } from './types'
import { validateDesign } from './authoring'
import { disclosePack } from './pack-disclosure'

type Row = Record<string, any>
export type RuntimeCatalog = {
  revision: string
  rules: Rules
  packs: Pack[]
  designs: CardDesign[]
  updates: GameView['updates']
}
export function parseRuntimeCatalog(input: unknown): RuntimeCatalog {
  const data = input as Row
  if (
    !data ||
    typeof data.revision !== 'string' ||
    !Array.isArray(data.configurations) ||
    !Array.isArray(data.designs) ||
    !Array.isArray(data.cases) ||
    !Array.isArray(data.updates)
  )
    throw new Error('The Supabase runtime catalog is invalid.')
  const configurations = data.configurations.filter(
    (c: Row) => c.active && c.status === 'published',
  )
  if (configurations.length !== 1 || !validateRules(configurations[0].rules))
    throw new Error('Publish exactly one valid active economy configuration in Supabase.')
  const configuration = configurations[0]
  const designs: CardDesign[] = data.designs
    .filter((d: Row) => d.enabled === true)
    .map((d: Row) => {
      validateDesign(Object.fromEntries(['slug','name','description','rarity','enabled','availability','base_value_override','default_attributes','visual_config'].filter((key) => d[key] != null).map((key) => [key,d[key]])), configuration.rules)
      if (
        typeof d.id !== 'string' ||
        typeof d.name !== 'string' ||
        typeof d.slug !== 'string' ||
        !(d.rarity in configuration.rules.rarity)
      )
        throw new Error('A published card design is invalid.')
      return { id: d.id, name: d.name, description: d.description, slug: d.slug, rarity: d.rarity, enabled: true, revision: d.revision,
        availability: d.availability, baseValue: d.base_value_override,
        defaults: d.default_attributes ?? {}, visual: d.visual_config ?? {} }
    })
  const packs: Pack[] = data.cases
    .filter((p: Row) => p.status === 'published')
    .map((p: Row) => {
      const odds = { ...p.odds, rarity: p.odds.rarity ?? [0,100,0,0,0,0,0,0,0,0,0,0] }
      if (
        !validateOdds(odds) ||
        !Number.isSafeInteger(p.price) ||
        p.price < 1 ||
        !Number.isSafeInteger(p.cards_per_opening) ||
        p.cards_per_opening < 1 ||
        p.cards_per_opening > 5
      )
        throw new Error('A published case has invalid prices, card counts or odds.')
      const pack: Pack = {
        id: p.id,
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        price: p.price,
        count: p.cards_per_opening,
        color: p.visual_config?.color ?? 'violet',
        visual: p.visual_config ?? {},
        odds,
        limited: p.kind === 'limited',
        stock: p.max_total_openings,
        edition: p.edition_cap,
        starts: p.starts_at,
        ends: p.ends_at,
        qualifyingTier: p.perfect_qualifying_tier ?? undefined,
        serialScope: p.serial_scope ?? null,
        maxDistinctPlayers: p.max_distinct_players,
        perPlayerLimit: p.per_player_limit,
        perPlayerDailyLimit: p.per_player_daily_limit,
        cooldownSeconds: p.cooldown_seconds,
        enabled:
          (!p.configuration_id || p.configuration_id === configuration.id),
      }
      if (p.pool_mode === 'assigned') {
        pack.pool = (data.pools ?? []).filter((entry: Row) => entry.case_id === p.id && Number(entry.weight) > 0).map((entry: Row) => {
          const design = designs.find((d) => String(d.id) === entry.design_id)
          if (!design || (!pack.limited && design.availability === 'limited-only'))
            throw new Error('A case has an ineligible assigned design.')
          return { designId: entry.design_id, name: design.name, rarity: design.rarity, weight: Number(entry.weight) }
        })
        if (!pack.pool?.length) throw new Error('An assigned case needs a published card pool.')
      }
      return disclosePack(pack, designs, configuration.rules)
    })
  return {
    revision: data.revision,
    rules: configuration.rules,
    designs,
    packs,
    updates: data.updates
      .filter((u: Row) => u.status === 'published')
      .map((u: Row) => ({
        id: u.id,
        title: u.title,
        category: u.category,
        summary: u.summary,
        details: u.details,
        publishedAt: u.published_at,
      })),
  }
}
