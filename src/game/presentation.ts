import { rarities, type Mutation } from './rules'
import type { Card } from './types'

export const mutationFinishes: Record<Mutation, string> = {
  Etched: 'etched',
  'Holo Foil': 'holo',
  Chrome: 'chrome',
  Shiny: 'shiny',
  Prismatic: 'prismatic',
  Beaming: 'beaming',
  Emberglass: 'emberglass',
  Gold: 'gold',
  Aurora: 'aurora',
  Rainbow: 'rainbow',
  Stardust: 'stardust',
  'Blue Gem': 'blue-gem',
  'Void Opal': 'void-opal',
  'Black Pearl': 'black-pearl',
}

export type PullImpact = 'epic' | 'legendary' | 'secret' | 'limited' | 'perfect'
export function pullImpact(card: Card): PullImpact | null {
  // Presentation only: Perfect eligibility and every value come from the
  // committed server snapshot. These effects never choose or upgrade a pull.
  if (card.snapshot.perfect) return 'perfect'
  if (card.attributes.limited) return 'limited'
  const rarity = rarities.indexOf(card.attributes.rarity)
  if (rarity >= 9) return 'secret'
  if (rarity >= 5) return 'legendary'
  const prizedFinish = ['Rainbow', 'Stardust', 'Blue Gem', 'Void Opal', 'Black Pearl'].includes(
    card.attributes.mutation ?? '',
  )
  return rarity >= 4 || prizedFinish || card.attributes.grade === 10 ? 'epic' : null
}
const impactRank: Record<PullImpact, number> = {
  epic: 1,
  legendary: 2,
  secret: 3,
  limited: 4,
  perfect: 5,
}
export function openingHighlight(cards: Card[]) {
  return cards.reduce<{ card: Card; impact: PullImpact } | null>((best, card) => {
    const impact = pullImpact(card)
    if (!impact) return best
    if (
      !best ||
      impactRank[impact] > impactRank[best.impact] ||
      (impactRank[impact] === impactRank[best.impact] && card.snapshot.tv > best.card.snapshot.tv)
    )
      return { card, impact }
    return best
  }, null)
}
