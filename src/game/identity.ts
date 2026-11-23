import type { Card, World } from './types'

export const designIdentity = (card: Pick<Card, 'designId' | 'designSlug' | 'name'>) =>
  String(card.designId ?? card.designSlug ?? card.name)

/** Continue above legacy numbers; never renumber a previously owned card. */
function allocate(w: World, scope: string, matches: (card: Card) => boolean, read: (card: Card) => number) {
  if (w.counters[scope] == null)
    w.counters[scope] = Object.values(w.cards).reduce(
      (max, card) => matches(card) ? Math.max(max, read(card)) : max, 0,
    )
  return ++w.counters[scope]
}

export function assignSerials(w: World, card: Card, perfect = card.snapshot.perfect) {
  const identity = designIdentity(card)
  const same = (other: Card) => designIdentity(other) === identity
  card.serial ??= allocate(w, `mint:design:${identity}`, same, c => c.serial ?? 0)
  if (card.attributes.limited && !card.attributes.serial) {
    const release = card.attributes.release
    card.attributes.serial = allocate(w, `limited:design:${release}:${identity}`,
      c => same(c) && c.attributes.release === release, c => c.attributes.serial ?? 0)
  }
  if (perfect && !card.perfectSerial)
    card.perfectSerial = allocate(w, `perfect:design:${identity}`,
      same, c => c.perfectSerial ?? 0)
}
