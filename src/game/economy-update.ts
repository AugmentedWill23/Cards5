import { defaultRules, type PackOdds, type Rules } from './rules'
import type { Pack, World } from './types'

export const ECONOMY_RELEASE = '2.2.0'
export const upgradeMarker = 'economy-upgrade:2_2_0'
export function upgradePreview(w: World) {
  const players = Object.values(w.players).filter((p) => !p.demo)
  const grants = players.map((p) => {
    const original = w.ledger.filter((l) => l.player === p.id && l.reason === 'Welcome grant · play credits only')
    const reviewed = original.length === 1 && Number.isSafeInteger(original[0].amount) && original[0].amount >= 0
    const grant = reviewed && !w.counters[`${upgradeMarker}:${p.id}`]
      ? Math.max(0, 1250 - original[0].amount) + 250 : 0
    return { id: p.id, name: p.name, balance: p.balance, originalWelcome: reviewed ? original[0].amount : null,
      grant, reviewRequired: !reviewed }
  })
  return { applied: !!w.counters[upgradeMarker], grants,
    eligible: grants.filter((p) => p.grant > 0).length,
    reviewRequired: grants.filter((p) => p.reviewRequired).length,
    total: grants.reduce((sum, p) => sum + p.grant, 0) }
}
export function upgradedRules(rules: Rules): Rules {
  return { ...structuredClone(rules), version: ECONOMY_RELEASE,
    rewards: { starter: 1250, daily: 150 },
    expansion: { ...(rules.expansion ?? defaultRules.expansion!), jobReward: 40, jobCooldownSeconds: 30, jobDailyLimit: 40 } }
}
export function intermediatePacks(packs: Pick<Pack, 'slug' | 'odds'>[]) {
  const blend = (first: string, second: string): PackOdds => {
    const a = packs.find((p) => p.slug === first)?.odds, b = packs.find((p) => p.slug === second)?.odds
    if (!a || !b) throw new Error('Publish Origin, Prism, Obsidian and Celestial before activating the economy update.')
    return { rarity: a.rarity.map((n, i) => (n + b.rarity[i]) / 2),
      quality: a.quality.map((n, i) => (n + b.quality[i]) / 2),
      grade: (a.grade + b.grade) / 2, mutation: (a.mutation + b.mutation) / 2, effect: (a.effect + b.effect) / 2 }
  }
  return [
    { id: 'release22-alloy', slug: 'alloy', name: 'Alloy Pack', subtitle: 'A stronger foundation for a growing collection.', price: 500, color: 'emerald', odds: blend('origin', 'prism') },
    { id: 'release22-aether', slug: 'aether', name: 'Aether Pack', subtitle: 'Between obsidian depths and celestial heights.', price: 2500, color: 'blue', odds: blend('obsidian', 'celestial') },
  ]
}
