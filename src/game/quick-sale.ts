import { createHash } from 'node:crypto'
import type { Card } from './types'

function duplicateKey(card: Card) {
  if (card.designId != null) return JSON.stringify(['design', String(card.designId)])
  if (card.designSlug) return JSON.stringify(['slug', card.designSlug])
  return JSON.stringify(['legacy', card.name, card.attributes.rarity])
}

/** The same quote logic is used for the private view and for the atomic sale. */
export function duplicateSaleQuote(
  cards: Iterable<Card>,
  actor: string,
  value: (card: Card) => Pick<Card['snapshot'], 'tv' | 'qsv' | 'perfect'>,
) {
  const keepers = new Map<string, { card: Card; tv: number; qsv: number }>()
  const extras: [id: string, qsv: number][] = []
  for (const card of cards) {
    if (card.owner !== actor || card.status === 'burned' || card.attributes.limited ||
        card.perfectSerial != null || card.snapshot.perfect) continue
    const { tv, qsv, perfect } = value(card)
    if (perfect) continue
    const key = duplicateKey(card)
    const keeper = keepers.get(key)
    if (!keeper || tv > keeper.tv ||
        (tv === keeper.tv && (card.createdAt < keeper.card.createdAt ||
          (card.createdAt === keeper.card.createdAt && card.id < keeper.card.id)))) {
      if (keeper?.card.status === 'owned') extras.push([keeper.card.id, keeper.qsv])
      keepers.set(key, { card, tv, qsv })
    } else if (card.status === 'owned') extras.push([card.id, qsv])
  }
  extras.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return {
    ids: extras.map(([id]) => id),
    credits: extras.reduce((total, [, qsv]) => total + qsv, 0),
    token: createHash('sha256').update(JSON.stringify([actor, extras])).digest('hex'),
  }
}
