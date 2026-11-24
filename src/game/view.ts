import { calculateValue, rarities, type Attributes, type Rules } from './rules'
import type { Card, World } from './types'

type PlayerStats = {
  balance: number
  collectionValue: number
  highestCard: number
  perfects: number
  rarityRank: number
  salesCount: number
}

function snapshotMatchesAttributes(snapshot: Card['snapshot'], attributes: Attributes, version: string) {
  if (snapshot.version !== version) return false
  // Older persisted cards may predate input snapshots; recalculate those safely.
  const saved = snapshot?.inputs
  if (!saved || typeof saved !== 'object') return false
  const keys = Object.keys(attributes) as (keyof Attributes)[]
  if (Object.keys(saved).length !== keys.length) return false
  return keys.every((key) => Object.is(saved[key], attributes[key]))
}

/**
 * Reuse committed card valuations while their inputs and formula version match.
 * Bump rules.version whenever any value-calculation coefficient changes.
 */
export function projectWorld(w: World, rules: Rules) {
  const cards: Record<string, Card> = {}
  const stats: Record<string, PlayerStats> = {}
  const rarityRanks = new Map(rarities.map((rarity, index) => [rarity, index]))

  for (const player of Object.values(w.players)) {
    stats[player.id] = {
      balance: player.balance,
      collectionValue: 0,
      highestCard: 0,
      perfects: 0,
      rarityRank: -1,
      salesCount: 0,
    }
  }

  for (const card of Object.values(w.cards)) {
    if (card.status === 'burned') continue
    const snapshot = snapshotMatchesAttributes(card.snapshot, card.attributes, rules.version)
      ? card.snapshot
      : calculateValue(card.attributes, rules)
    const current = snapshot === card.snapshot
      ? { ...card, openingSnapshot: card.snapshot }
      : { ...card, openingSnapshot: card.snapshot, snapshot }
    cards[card.id] = current

    const playerStats = stats[card.owner]
    if (!playerStats) continue
    playerStats.collectionValue += snapshot.tv
    playerStats.highestCard = Math.max(playerStats.highestCard, snapshot.tv)
    playerStats.perfects += Number(snapshot.perfect)
    playerStats.rarityRank = Math.max(
      playerStats.rarityRank,
      rarityRanks.get(card.attributes.rarity) ?? -1,
    )
  }

  for (const auction of Object.values(w.expansion?.auctions ?? {})) {
    const high = auction.status === 'active' ? auction.bids.at(-1) : null
    if (high && !high.npc && stats[high.bidder]) stats[high.bidder].balance += high.amount
  }
  for (const trade of Object.values(w.trades)) {
    if (trade.status !== 'pending') continue
    if (stats[trade.from]) stats[trade.from].balance += trade.fromCoins
    if (trade.toReserved && stats[trade.to]) stats[trade.to].balance += trade.toCoins
  }
  for (const battle of Object.values(w.casino?.battles ?? {})) {
    if (battle.status !== 'waiting') continue
    for (const id of battle.players) if (stats[id]) stats[id].balance += battle.cost
  }
  for (const [id, hand] of Object.entries(w.casino?.hands ?? {})) {
    if (hand.status === 'playing' && stats[id]) stats[id].balance += hand.bet
  }
  for (const sale of w.sales) if (stats[sale.seller]) stats[sale.seller].salesCount++
  return { cards, stats }
}
