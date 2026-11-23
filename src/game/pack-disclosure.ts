import { mutationDistribution, mutations, qualities, rarities } from './rules'
import type { Rules } from './rules'
import type { CardDesign, Pack } from './types'

export function disclosePack(pack: Pack, designs: CardDesign[], rules: Rules): Pack {
  const eligible = designs.filter((d) => d.enabled && (!d.availability || d.availability === 'standard'))
  const weighted = pack.pool ? pack.pool.map((p) => ({ design: designs.find((d) => String(d.id) === p.designId), weight: p.weight }))
    : eligible.map((design) => ({ design,
      weight: pack.odds.rarity[rarities.indexOf(design.rarity)] /
        eligible.filter((d) => d.rarity === design.rarity).length })).filter((entry) => entry.weight > 0)
  const final = { rarity: rarities.map(() => 0), quality: qualities.map(() => 0), grade: 0, mutation: 0, effect: 0 }
  if (Math.abs(weighted.reduce((sum, entry) => sum + entry.weight, 0) - 100) > 1e-7)
    throw new Error('A published pack has a rarity with no enabled standard designs.')
  const rolling = mutationDistribution(rules)
  const distribution = mutations.filter((name) => rules.mutation[name] != null).map((name) => ({
    name,weight:rolling.find((m) => m.name===name)?.weight??0,multiplier:rules.mutation[name],
  }))
  const mutationRates = Object.fromEntries(distribution.map((d) => [d.name, 0]))
  const overrides: NonNullable<Pack['overrides']> = []
  for (const { design, weight } of weighted) {
    if (!design) throw new Error('A published case contains an unavailable design.')
    final.rarity[rarities.indexOf(design.rarity)] += weight
    const d = design.defaults ?? {}
    for (let i = 0; i < qualities.length; i++)
      final.quality[i] += weight * (d.quality ? (d.quality === qualities[i] ? 1 : 0) : pack.odds.quality[i] / 100)
    for (const key of ['grade','mutation','effect'] as const)
      final[key] += weight * (Object.hasOwn(d, key) ? (d[key] == null ? 0 : 1) : pack.odds[key] / 100)
    if (Object.hasOwn(d, 'mutation')) {
      if (d.mutation) mutationRates[d.mutation] = (mutationRates[d.mutation] ?? 0) + weight
    } else for (const outcome of distribution)
      mutationRates[outcome.name] += weight * pack.odds.mutation / 100 * outcome.weight / 100
    if (Object.keys(d).length || design.baseValue != null)
      overrides.push({ name: design.name, defaults: d, baseValue: design.baseValue })
  }
  return { ...pack, displayOdds: final, overrides,
    mutationOdds: distribution.map((d) => ({
      ...d, weight: final.mutation ? mutationRates[d.name] / final.mutation * 100 : 0,
    })) }
}
