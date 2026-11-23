import { appAuth } from '@/lib/app-auth'
import { operatorRole, previewEconomySnapshot } from '@/game/repository'
import { serviceClient } from '@/lib/supabase/server'
import { validateOdds, validateRules, type PackOdds, type Rules } from '@/game/rules'
import { getCatalog } from '@/game/catalog'

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const user = await appAuth.currentUser(),
      role = await operatorRole(user)
    if (!role)
      return Response.json(
        { error: 'An explicitly assigned Supabase operator role is required.' },
        { status: 403, headers },
      )
    const query = new URL(request.url).searchParams,
      id = query.get('id'),
      kind = query.get('kind')
    if (!id || id.length > 160 || !['pack', 'configuration', 'event'].includes(kind ?? ''))
      throw new Error(
        'Choose a saved Supabase case, configuration, or economy sequence to preview.',
      )
    const client = serviceClient()
    if (kind === 'event') {
      if (!['owner', 'operator', 'economy'].includes(role))
        return Response.json(
          { error: 'Economy access is required for private history.' },
          { status: 403, headers },
        )
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
        throw new Error('Enter a valid economy sequence.')
      return Response.json({ kind, world: await previewEconomySnapshot(Number(id)) }, { headers })
    }
    if (kind === 'pack') {
      const { data: p, error } = await client
        .from('vault_cases')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error || !p) throw new Error('The case was not found.')
      if (p.pool_mode !== 'rarity' || !validateOdds(p.odds as PackOdds))
        throw new Error('This preview supports valid rarity-pool cases only.')
      const { rules } = await getCatalog()
      return Response.json(
        {
          kind,
          rules,
          pack: {
            id: p.id,
            name: p.name,
            slug: p.slug,
            subtitle: p.subtitle,
            price: p.price,
            count: p.cards_per_opening,
            odds: p.odds,
            color: p.visual_config?.color ?? 'violet',
            limited: p.kind === 'limited',
            stock: p.max_total_openings,
            edition: p.edition_cap,
            starts: p.starts_at,
            ends: p.ends_at,
            qualifyingTier: p.perfect_qualifying_tier,
          },
        },
        { headers },
      )
    }
    const { data, error } = await client
      .from('vault_configurations')
      .select('rules')
      .eq('id', id)
      .maybeSingle()
    if (error || !data || !validateRules(data.rules as Rules))
      throw new Error('The configuration is unavailable or invalid.')
    return Response.json({ kind, rules: data.rules }, { headers })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Preview unavailable.' },
      { status: 400, headers },
    )
  }
}
