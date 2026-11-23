import { calculateValue } from './rules'
import { drawPackCard } from './designs'
import { assignSerials } from './identity'
import type { EngineEnv } from './engine'
import type { Card, Pack, World } from './types'

export function mintPack(w: World, actor: string, pack: Pack, env: EngineEnv, source = pack.name) {
  return Array.from({ length: pack.count }, () => {
    const { attributes, design } = drawPackCard(pack, env.designs, env.rules, env.random)
    if (pack.limited) {
      attributes.limited = true
      attributes.release = pack.serialScope ?? pack.slug
      attributes.qualifyingTier = pack.qualifyingTier
      attributes.edition = pack.edition || undefined
      const key = `limited:${attributes.release}`
      w.counters[key] = (w.counters[key] ?? 0) + 1
    }
    const at = new Date(env.now).toISOString()
    // Limited valuation needs its design-specific serial before it is calculated.
    const card = {
      id: env.uuid(), name: design.name, description: design.description,
      designId: design.id, designSlug: design.slug, visual: design.visual,
      owner: actor, attributes, createdAt: at, source, status: 'owned',
      provenance: [{ at, action: 'Unboxed', to: actor }],
    } as Card
    assignSerials(w, card, false)
    card.snapshot = calculateValue(attributes, env.rules)
    assignSerials(w, card)
    w.cards[card.id] = card
    return card
  })
}
