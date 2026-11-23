import { calculateValue, rarities, type Rules } from './rules'
import type { Pack, World } from './types'

export const collectorTiers = [
  { name: 'Collector', level: 1, worth: 0, packPrice: 500, rarity: 'Epic' },
  { name: 'Curator', level: 3, worth: 5000, packPrice: 2500, rarity: 'Legendary' },
  { name: 'Archivist', level: 6, worth: 25000, packPrice: 10000, rarity: 'Mythical' },
  { name: 'Vaultkeeper', level: 10, worth: 100000, packPrice: 50000, rarity: 'Extreme' },
  { name: 'Magnate', level: 15, worth: 500000, packPrice: 250000, rarity: 'Secret' },
  { name: 'Sovereign', level: 20, worth: 2500000, packPrice: 1e12, rarity: 'Godly Secret' },
] as const
export const slotTiers = [
  { id: 'copper', name: 'Copper', level: 1, worth: 0, multiplier: 1 },
  { id: 'silver', name: 'Silver', level: 3, worth: 5000, multiplier: 5 },
  { id: 'gold', name: 'Gold', level: 6, worth: 25000, multiplier: 25 },
  { id: 'platinum', name: 'Platinum', level: 10, worth: 100000, multiplier: 100 },
  { id: 'obsidian', name: 'Obsidian', level: 15, worth: 500000, multiplier: 500 },
] as const
export const xpForLevel = (level: number) => 50 * (level - 1) ** 2
export const dailyBaseReward = (rules: Rules) =>
  Math.floor((rules.rewards?.daily ?? 50) * ((rules.rewards?.starter ?? 0) >= 1250 ? 1.5 : 1))
export const jobBaseReward = (rules: Rules) =>
  Math.floor((rules.expansion?.jobReward ?? 15) * ((rules.rewards?.starter ?? 0) >= 1250 ? 1.5 : 1))
export function wealth(w: World, actor: string, rules: Rules) {
  let total = w.players[actor]?.balance ?? 0
  for (const card of Object.values(w.cards))
    if (card.owner === actor && card.status !== 'burned') total += calculateValue(card.attributes, rules).tv
  for (const trade of Object.values(w.trades)) if (trade.status === 'pending')
    total += trade.from === actor ? trade.fromCoins : trade.to === actor && trade.toReserved ? trade.toCoins : 0
  for (const a of Object.values(w.expansion?.auctions ?? {})) {
    const bid = a.status === 'active' ? a.bids.at(-1) : undefined
    if (bid?.bidder === actor && !bid.npc) total += bid.amount
  }
  for (const battle of Object.values(w.casino?.battles ?? {}))
    if (battle.status === 'waiting' && battle.players.includes(actor)) total += battle.cost
  const hand = w.casino?.hands[actor]
  if (hand?.status === 'playing') total += hand.bet
  return total
}
export function advancement(w: World, actor: string, rules: Rules) {
  const xp = w.counters[`xp:${actor}`] ?? 0
  const level = Math.min(100, 1 + Math.floor(Math.sqrt(xp / 50)))
  const netWorth = wealth(w, actor, rules)
  // Wealth milestones are retained once legitimately reached. Spending never
  // relocks a pack between confirmation and purchase.
  const peakWorth = Math.max(netWorth, w.counters[`peak-worth:${actor}`] ?? 0)
  const tier = [...collectorTiers].reverse().find(t => level >= t.level && peakWorth >= t.worth)!
  return { xp, level, netWorth, peakWorth, tier: tier.name,
    nextXp: xpForLevel(level + 1), levelXp: xpForLevel(level),
    maxPackPrice: tier.packPrice, guaranteedRarity: tier.rarity,
    nextTier: collectorTiers.find(t => t.level > tier.level) ?? null }
}
export type ReturnAdvancement = ReturnType<typeof advancement>
export function packRequirement(pack: Pack) {
  const guaranteedRank = pack.pool?.length
    ? Math.min(...pack.pool.map(p => rarities.indexOf(p.rarity))) : -1
  return collectorTiers.find(t => pack.price <= t.packPrice &&
    guaranteedRank <= rarities.indexOf(t.rarity)) ?? collectorTiers.at(-1)!
}
export function packLock(pack: Pack, progress: ReturnType<typeof advancement>, rules: Rules) {
  if ((rules.rewards?.starter ?? 0) < 1250) return ''
  const tier = packRequirement(pack)
  return progress.level < tier.level || progress.peakWorth < tier.worth
    ? `${tier.name} · level ${tier.level} + ${tier.worth.toLocaleString('en-US')} peak net worth`
    : ''
}
export function assertPackAccess(w: World, actor: string, pack: Pack, rules: Rules) {
  const reason = packLock(pack, advancement(w, actor, rules), rules)
  if (reason) throw new Error(`Unlock this pack at ${reason}. Random rarity odds are never reduced.`)
}
export function slotConfiguration(rules: Rules, tierId: unknown = 'copper') {
  const tier = slotTiers.find(t => t.id === tierId)
  if (!tier) throw new Error('Choose a valid slot tier.')
  const enhanced = (rules.rewards?.starter ?? 0) >= 1250
  return { ...rules.slots, tier, cost: rules.slots.cost * tier.multiplier,
    rewards: rules.slots.rewards.map(r => ({ ...r, amount: r.amount * tier.multiplier * (enhanced ? 2 : 1) })) }
}
