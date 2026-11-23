import { calculateValue, rarities, type Rules } from './rules'
import type { Card, World } from './types'

/** One value calculation per live card, rather than per player and per metric. */
export function projectWorld(w: World, rules: Rules) {
  const cards: Record<string, Card> = {}
  const stats = Object.fromEntries(Object.values(w.players).map(p => [p.id, {
    balance: p.balance, collectionValue: 0, highestCard: 0, perfects: 0, rarityRank: -1, salesCount: 0,
  }]))
  for (const card of Object.values(w.cards)) {
    if (card.status === 'burned') continue
    const current = { ...card, openingSnapshot: card.snapshot, snapshot: calculateValue(card.attributes, rules) }
    cards[card.id] = current
    const s = stats[card.owner]
    if (!s) continue
    s.collectionValue += current.snapshot.tv
    s.highestCard = Math.max(s.highestCard, current.snapshot.tv)
    s.perfects += Number(current.snapshot.perfect)
    s.rarityRank = Math.max(s.rarityRank, rarities.indexOf(card.attributes.rarity))
  }
  for (const a of Object.values(w.expansion?.auctions ?? {})) {
    const high = a.status === 'active' ? a.bids.at(-1) : null
    if (high && !high.npc && stats[high.bidder]) stats[high.bidder].balance += high.amount
  }
  for (const t of Object.values(w.trades)) if (t.status === 'pending') {
    if (stats[t.from]) stats[t.from].balance += t.fromCoins
    if (t.toReserved && stats[t.to]) stats[t.to].balance += t.toCoins
  }
  for (const b of Object.values(w.casino?.battles ?? {})) if (b.status === 'waiting')
    for (const id of b.players) if (stats[id]) stats[id].balance += b.cost
  for (const [id, h] of Object.entries(w.casino?.hands ?? {}))
    if (h.status === 'playing' && stats[id]) stats[id].balance += h.bet
  for (const sale of w.sales) if (stats[sale.seller]) stats[sale.seller].salesCount++
  return { cards, stats }
}
