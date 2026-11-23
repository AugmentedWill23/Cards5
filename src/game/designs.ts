import { rollAttributes, weightedIndex, type Attributes, type Rarity, type Rules } from './rules'
import type { CardDesign, Pack } from './types'

// Rarity is rolled first using pack odds. A design is an equally likely
// identity within that tier, never an additional value or rarity modifier.
export function drawCardDesign(
  rarity: Rarity,
  designs: CardDesign[],
  random: () => number,
): CardDesign {
  const pool = designs.filter((design) => design.enabled && design.rarity === rarity &&
    (!design.availability || design.availability === 'standard'))
  if (!pool.length)
    throw new Error(`The ${rarity} card catalog is not available. No opening was charged.`)
  return pool[Math.floor(random() * pool.length)]
}

export function designAttributes(attributes: Attributes, design: CardDesign, rules: Rules): Attributes {
  const defaults = design.defaults ?? {}
  if (defaults.effect && (!rules.effects[defaults.effect] || rules.effects[defaults.effect].enabled === false ||
      rules.effects[defaults.effect].archived))
    throw new Error('A design uses an unavailable special effect. No cards were charged.')
  return { ...attributes, ...defaults, rarity: design.rarity,
    ...(design.baseValue == null ? {} : { baseValue: design.baseValue }) }
}
export function drawPackCard(pack: Pack, designs: CardDesign[], rules: Rules, random: () => number) {
  const attributes = rollAttributes(pack.odds, rules, random)
  let design: CardDesign
  if (pack.pool) {
    const total = pack.pool.reduce((sum, entry) => sum + entry.weight, 0)
    if (!pack.pool.length || Math.abs(total - 100) > 1e-7 ||
        pack.pool.some((entry) => !Number.isFinite(entry.weight) || entry.weight <= 0))
      throw new Error('Assigned card weights must total 100%.')
    const selected = pack.pool[weightedIndex(pack.pool.map((entry) => entry.weight), random)]
    const found = designs.find((d) => String(d.id) === selected.designId && d.enabled)
    if (!found || (!pack.limited && found.availability === 'limited-only'))
      throw new Error('An assigned design is disabled or ineligible. No opening was charged.')
    design = found
  } else design = drawCardDesign(attributes.rarity, designs, random)
  return { design, attributes: designAttributes(attributes, design, rules) }
}
