import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
  calculateValue,
  defaultRules as rules,
  isPerfect,
  marketValue,
  mutations,
  legacyMutations,
  mutationDistribution,
  qualities,
  rarities,
  rollAttributes,
  serialBonus,
  validateOdds,
  validateRules,
  type Attributes,
  type PackOdds,
} from '../src/game/rules'
import { applyCommand, type EngineEnv } from '../src/game/engine'
import { duplicateSaleQuote } from '../src/game/quick-sale'
import { commitAtomic, type Revision } from '../src/game/commit'
import { decodeSnapshot, encodeSnapshot } from '../src/game/snapshot'
import { expansionView, minimumBid } from '../src/game/expansion'
import { gradingFee, expansionRules } from '../src/game/rules'
import {
  emptyWorld,
  type Card,
  type CardDesign,
  type GameCommand,
  type Pack,
  type World,
} from '../src/game/types'
import { drawCardDesign } from '../src/game/designs'
import { disclosePack } from '../src/game/pack-disclosure'
import { upgradeMarker, upgradePreview, upgradedRules } from '../src/game/economy-update'
import { progressionView } from '../src/game/progression'
import { validateCase, validateDesign } from '../src/game/authoring'
import designSeed from '../content/card-designs.seed.json'
import extraDesignSeed from '../content/card-designs-expansion.seed.json'
import { mutationFinishes, openingHighlight, pullImpact } from '../src/game/presentation'
import { advancement, packLock, slotConfiguration, xpForLevel } from '../src/game/advancement'
import { assignSerials } from '../src/game/identity'
import { casinoView, handValue, plinkoMultipliers } from '../src/game/casino'
import { storageValue } from '../src/game/expansion'
import { projectWorld } from '../src/game/view'
import { caseUsage } from '../src/game/case-usage'

const designs: CardDesign[] = rarities.flatMap((rarity, tier) =>
  [...designSeed[rarity], ...extraDesignSeed[rarity]].map((name, index) => ({
    id: `test-design-${tier}-${index}`,
    slug: `${tier}-${index}`,
    rarity,
    name,
    enabled: true,
  })),
)

const attrs: Attributes = { rarity: 'Rare', quality: 'Normal', grade: 7 }
const odds: PackOdds = {
  rarity: [25, 35, 20, 10, 5, 2.8, 1.2, 0.5, 0.25, 0.12, 0.1, 0.03],
  quality: [5, 10, 35, 25, 18, 7],
  grade: 30,
  mutation: 20,
  effect: 10,
}
const pack: Pack = {
  id: 'origin',
  name: 'Origin Pack',
  slug: 'origin',
  subtitle: 'Test',
  color: 'emerald',
  price: 250,
  count: 3,
  enabled: true,
  odds,
}
const env: EngineEnv = {
  now: Date.UTC(2026, 10, 17),
  random: () => 0.5,
  uuid: randomUUID,
  rules,
  packs: [pack],
  designs,
}
function card(id: string, owner: string): Card {
  return {
    id,
    name: 'Cipher',
    owner,
    attributes: attrs,
    snapshot: calculateValue(attrs, rules),
    createdAt: new Date(env.now).toISOString(),
    source: 'Test pack',
    status: 'owned',
    provenance: [],
  }
}
function world() {
  const w = emptyWorld()
  for (const id of ['a', 'b', 'c', 'demo-seeded'])
    w.players[id] = {
      id,
      name: id,
      demo: id.startsWith('demo'),
      balance: 12500,
      joined: new Date(env.now).toISOString(),
    }
  w.cards.one = card('one', 'a')
  w.cards.two = card('two', 'b')
  return w
}
function run(
  w: World,
  actor: string,
  action: string,
  fields: Record<string, unknown> = {},
  options = env,
) {
  return applyCommand(w, actor, { action, key: randomUUID(), ...fields }, options)
}

test('all 12 rarity and 6 quality values are strictly monotonic; full config validates', () => {
  assert.equal(rarities.length, 12)
  assert.equal(qualities.length, 6)
  assert(validateRules(rules))
  assert(rules.rarity.Secret > rules.rarity['Sudo-Secret'])
})
test('every mutation has a distinct cosmetic finish without altering card attributes or value', () => {
  assert.deepEqual(Object.keys(mutationFinishes), [...mutations])
  assert.equal(new Set(Object.values(mutationFinishes)).size, mutations.length)
  const original = world().cards.one
  const before = structuredClone(original)
  assert.equal(pullImpact(original), null)
  assert.equal(openingHighlight([original]), null)
  assert.deepEqual(original, before)
})
test('pull celebrations use committed metadata, choose the highest impact, and never recalculate Perfect eligibility', () => {
  const ordinary = world().cards.one
  const epic = { ...ordinary, id: 'epic', attributes: { ...attrs, rarity: 'Epic' as const } }
  const legendary = {
    ...ordinary,
    id: 'legendary',
    attributes: { ...attrs, rarity: 'Legendary' as const },
  }
  const secret = {
    ...ordinary,
    id: 'secret',
    attributes: { ...attrs, rarity: 'Sudo-Secret' as const },
  }
  const limited = { ...ordinary, id: 'limited', attributes: { ...attrs, limited: true, serial: 1 } }
  const perfect = {
    ...ordinary,
    id: 'perfect',
    snapshot: { ...ordinary.snapshot, perfect: true },
    perfectSerial: 7,
  }
  assert.equal(pullImpact(epic), 'epic')
  assert.equal(pullImpact(legendary), 'legendary')
  assert.equal(pullImpact(secret), 'secret')
  assert.equal(pullImpact(limited), 'limited')
  assert.equal(pullImpact(perfect), 'perfect')
  assert.equal(openingHighlight([epic, secret, perfect, legendary, limited])?.card.id, 'perfect')
  assert.equal(openingHighlight([]), null)
  const notCertified = {
    ...ordinary,
    attributes: {
      ...attrs,
      rarity: 'Extraordinary' as const,
      quality: 'Mint Condition' as const,
      grade: 10,
    },
    snapshot: { ...ordinary.snapshot, perfect: false },
  }
  assert.equal(pullImpact(notCertified), 'legendary')
  assert.equal(pullImpact({ ...ordinary, attributes: { ...attrs, mutation: 'Blue Gem' } }), 'epic')
})
test('the expanded catalog contains 372 distinct identities, with 31 in every standard rarity', () => {
  assert.deepEqual(Object.keys(designSeed), [...rarities])
  assert.deepEqual(Object.keys(extraDesignSeed), [...rarities])
  assert.equal(designs.length, 372)
  assert.equal(new Set(designs.map((d) => d.name.toLowerCase())).size, 372)
  for (const rarity of rarities) {
    const pool = designs.filter((d) => d.rarity === rarity)
    assert.equal(pool.length, 31)
    assert.equal(drawCardDesign(rarity, designs, () => 0).name, pool[0].name)
    assert.equal(drawCardDesign(rarity, designs, () => 0.999999).name, pool[30].name)
    assert(pool.every((d) => d.name.length >= 2 && d.name.length <= 80))
  }
  for (const name of [
    'Cipher',
    'Parallax',
    'Monolith',
    'Eclipse',
    'Afterglow',
    'Obsidian',
    'Solstice',
    'Resonance',
    'Event Horizon',
    'Aether',
    'Genesis',
    'Singularity',
  ])
    assert(designs.some((d) => d.name === name))
})
test('all 14 configured mutations are individually reachable with disclosed odds and valid values', () => {
  const distribution = mutationDistribution(rules)
  assert.equal(distribution.length, 14)
  assert.equal(
    distribution.reduce((sum, row) => sum + row.weight, 0),
    100,
  )
  let cumulative = 0
  for (const row of distribution) {
    const rolls = [0.5, 0.5, 0.5, 0, (cumulative + row.weight / 2) / 100, 0.5]
    const attributes = rollAttributes(
      { ...odds, grade: 0, mutation: 100, effect: 0 },
      rules,
      () => rolls.shift() ?? 0.5,
    )
    assert.equal(attributes.mutation, row.name)
    const value = calculateValue({ ...attrs, mutation: row.name }, rules)
    assert.equal(value.tv, Math.floor(250 * row.multiplier))
    assert.equal(value.qsv, Math.floor((value.tv * 65) / 100))
    cumulative += row.weight
  }
})
test('legacy configurations keep their original seven mutation probabilities and existing card values', () => {
  const legacy = structuredClone(rules)
  delete legacy.mutationWeights
  for (const name of mutations)
    if (!legacyMutations.includes(name as (typeof legacyMutations)[number]))
      delete legacy.mutation[name]
  legacy.version = '2.0.0'
  assert(validateRules(legacy))
  assert.deepEqual(
    mutationDistribution(legacy).map((row) => row.weight),
    [45, 25, 15, 8, 4, 2, 1],
  )
  for (const name of legacyMutations) {
    const oldValue = calculateValue({ ...attrs, mutation: name }, legacy)
    const currentValue = calculateValue({ ...attrs, mutation: name }, rules)
    assert.equal(currentValue.tv, oldValue.tv)
    assert.equal(currentValue.qsv, oldValue.qsv)
  }
  assert.equal(
    rollAttributes({ ...odds, grade: 0, mutation: 100, effect: 0 }, legacy, () => 0.5).mutation,
    'Shiny',
  )
  assert.equal(
    rollAttributes({ ...odds, grade: 0, mutation: 100, effect: 0 }, rules, () => 0.5).mutation,
    'Chrome',
  )
})
test('mutation weights reject malformed odds and allow disabling future rolls without invalidating old cards', () => {
  assert(!validateRules({ ...rules, mutationWeights: { ...rules.mutationWeights, Etched: -1 } }))
  assert(!validateRules({ ...rules, mutationWeights: { Etched: 99 } }))
  assert(!validateRules({ ...rules, mutationWeights: { Unknown: 100 } }))
  const config = structuredClone(rules)
  config.mutationWeights!['Void Opal'] = 0
  config.mutationWeights!['Holo Foil'] += 0.5
  assert(validateRules(config))
  assert(!mutationDistribution(config).some((row) => row.name === 'Void Opal'))
  assert.equal(calculateValue({ ...attrs, mutation: 'Void Opal' }, config).tv, 1375)
})
test('disabled designs never roll; a missing rarity catalog fails without charging or rewriting existing cards', () => {
  const disabled = designs.map((d) => ({ ...d, enabled: d.rarity !== 'Common' }))
  assert.throws(() => drawCardDesign('Common', disabled, () => 0.5), /catalog is not available/)
  const start = world(),
    original = structuredClone(start)
  assert.throws(
    () => run(start, 'a', 'open', { pack: 'origin', count: 1 }, { ...env, designs: [] }),
    /catalog is not available/,
  )
  assert.deepEqual(start, original)
})
for (const rarity of rarities) {
  test(`${rarity} pack pulls select matching designs without changing rarity odds or card values`, () => {
    const table: number[] = rarities.map((tier) => (tier === rarity ? 100 : 0))
    if (rarity === 'Secret') {
      table[9] = 50
      table[10] = 50
    }
    const targeted: Pack = {
      ...pack,
      odds: { rarity: table, quality: [0, 0, 100, 0, 0, 0], grade: 0, mutation: 0, effect: 0 },
    }
    const start = world()
    const result = run(
      start,
      'a',
      'open',
      { pack: 'origin', count: 1 },
      { ...env, packs: [targeted], random: () => (rarity === 'Secret' ? 0.75 : 0.5) },
    )
    for (const card of result.result.cards!) {
      const definition = designs.find((d) => d.id === card.designId)!
      assert.equal(card.attributes.rarity, rarity)
      assert.equal(definition.rarity, rarity)
      assert.equal(card.name, definition.name)
      assert.equal(card.designSlug, definition.slug)
      assert.deepEqual(card.snapshot, calculateValue(card.attributes, rules))
    }
    assert.deepEqual(result.state.cards.one, start.cards.one)
    assert.equal(result.state.players.a.balance, 12500 - pack.price)
  })
}
test('odds total 100 and reject malformed, negative, or reversed Secret odds', () => {
  assert(validateOdds(odds))
  assert(!validateOdds({ ...odds, rarity: [100] }))
  assert(!validateOdds({ ...odds, grade: 101 }))
  assert(!validateOdds({ ...odds, quality: [-5, 20, 35, 25, 18, 7] }))
  const reversed = [...odds.rarity]
  ;[reversed[9], reversed[10]] = [reversed[10], reversed[9]]
  assert(!validateOdds({ ...odds, rarity: reversed }))
})
test('generation always produces required rarity/quality and constrained optional attributes', () => {
  let seed = 177
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  let grades = 0,
    mutated = 0,
    effects = 0
  for (let i = 0; i < 20000; i++) {
    const a = rollAttributes(odds, rules, random)
    assert(rarities.includes(a.rarity))
    assert(qualities.includes(a.quality))
    if (a.grade != null) {
      grades++
      assert(Number.isInteger(a.grade) && a.grade >= 1 && a.grade <= 10)
    }
    if (a.mutation) {
      mutated++
      assert(mutations.includes(a.mutation))
      assert.equal(typeof a.mutation, 'string')
    }
    if (a.effect) {
      effects++
      assert(rules.effects[a.effect])
    }
  }
  assert(Math.abs(grades / 20000 - 0.3) < 0.025)
  assert(Math.abs(mutated / 20000 - 0.2) < 0.025)
  assert(Math.abs(effects / 20000 - 0.1) < 0.025)
})
test('0% optional chances never roll; 100% always rolls', () => {
  const none = rollAttributes({ ...odds, grade: 0, mutation: 0, effect: 0 }, rules, () => 0.5)
  assert.equal(none.grade, null)
  assert.equal(none.mutation, null)
  assert.equal(none.effect, null)
  const all = rollAttributes(
    { ...odds, grade: 100, mutation: 100, effect: 100 },
    rules,
    () => 0.999999,
  )
  assert.equal(all.grade, 10)
  assert(all.mutation)
  assert(all.effect)
})
test('invalid required attributes, multiple mutations and invalid grades are rejected', () => {
  for (const bad of [
    { rarity: undefined },
    { quality: undefined },
    { grade: 11 },
    { grade: 0 },
    { grade: 7.5 },
    { mutation: ['Gold', 'Rainbow'] },
    { effect: 'Unknown' },
  ])
    assert.throws(() => calculateValue({ ...attrs, ...bad } as Attributes, rules))
})
test('QSV is precisely floor(65% of integer TV)', () => {
  for (const rarity of rarities)
    for (const quality of qualities)
      for (let grade = 1; grade <= 10; grade++) {
        const s = calculateValue({ rarity, quality, grade }, rules)
        assert.equal(s.qsv, Number((BigInt(s.tv) * 65n) / 100n))
      }
})
test('Grade 7 neutral; low grades decrease and high grades increase monotonically', () => {
  const base = calculateValue({ ...attrs, grade: null }, rules).tv
  assert.equal(calculateValue(attrs, rules).tv, base)
  for (let g = 1; g < 7; g++) assert(calculateValue({ ...attrs, grade: g }, rules).tv < base)
  for (let g = 8; g <= 10; g++) assert(calculateValue({ ...attrs, grade: g }, rules).tv > base)
})
test('Sudo-Secret no bonus, Secret 2× and Godly Secret 3×', () => {
  for (const [rarity, factor] of [
    ['Sudo-Secret', 1],
    ['Secret', 2],
    ['Godly Secret', 3],
  ] as const)
    assert.equal(calculateValue({ ...attrs, rarity }, rules).tv, rules.rarity[rarity] * factor)
})
test('Perfect eligibility excludes low rarity, non-mint, missing grade and non-qualifying Limited', () => {
  assert(isPerfect({ rarity: 'Extraordinary', quality: 'Mint Condition', grade: 10 }))
  for (const a of [
    { rarity: 'Mythical', quality: 'Mint Condition', grade: 10 },
    { rarity: 'Extreme', quality: 'High Quality', grade: 10 },
    { rarity: 'Godly Secret', quality: 'Mint Condition' },
    {
      rarity: 'Godly Secret',
      quality: 'Mint Condition',
      grade: 10,
      limited: true,
      qualifyingTier: 'Rare',
    },
  ])
    assert(!isPerfect(a as Attributes))
})
test('Perfect +450% means 5.5×, after Limited, serial and rarity treatment', () => {
  const a: Attributes = {
    rarity: 'Secret',
    quality: 'Mint Condition',
    grade: 10,
    limited: true,
    qualifyingTier: 'Extraordinary',
    serial: 3,
  }
  const value = calculateValue(a, rules),
    bonus = serialBonus(3, rules).reduce((n, b) => n + b.bonus, 0)
  assert.equal(value.tv, Math.floor(150000 * 2 * 2 * 2 * (1 + bonus) * 2 * 5.5))
  assert.equal(value.steps.at(-1)?.multiplier, 5.5)
})
for (const [serial, expected] of [
  [501, 0],
  [500, 0.15],
  [300, 0.4],
  [100, 0.75],
  [75, 1.2],
  [35, 1.95],
  [15, 3.15],
  [4, 4.65],
  [3, 6.65],
  [2, 10.15],
  [1, 15.15],
]) {
  test(`Limited serial #${serial}: cumulative additive bonus ${expected * 100}%`, () => {
    const a: Attributes = { ...attrs, limited: true, serial },
      result = calculateValue(a, rules)
    assert(Math.abs(result.serialBonus - expected) < 1e-8)
    assert.equal(result.tv, Math.floor(250 * 2 * (1 + expected) + 1e-8))
  })
}
test('invalid serials rejected', () => {
  for (const s of [0, -1, 1.5, Infinity, NaN])
    assert.throws(() => calculateValue({ ...attrs, limited: true, serial: s }, rules))
})
test('PMV uses only recent exact comparable completed sales and falls back to TV', () => {
  const at = new Date(env.now - 1000).toISOString()
  assert.deepEqual(marketValue(attrs, 250, [], env.now), { value: 250, count: 0, lastSale: null })
  const sales = [
    { attributes: attrs, amount: 300, at },
    { attributes: attrs, amount: 400, at },
    { attributes: { ...attrs, grade: 8 }, amount: 99999, at },
    { attributes: attrs, amount: 99999, at: new Date(env.now - 31 * 86400000).toISOString() },
  ]
  const pmv = marketValue(attrs, 250, sales, env.now)
  assert.equal(pmv.value, 350)
  assert.equal(pmv.count, 2)
  assert.equal(pmv.lastSale, at)
})
test('opening charges once, creates all cards and a receipt; idempotency returns exact outcome', () => {
  const start = world(),
    cmd: GameCommand = { action: 'open', key: 'same-opening', pack: 'origin', count: 2 }
  const first = applyCommand(start, 'a', cmd, env),
    second = applyCommand(first.state, 'a', cmd, env)
  assert.equal(first.result.cards?.length, 6)
  assert.equal(first.state.players.a.balance, 12000)
  assert.equal(first.state.receipts.length, 1)
  assert.deepEqual(first, second)
  assert.equal(start.players.a.balance, 12500)
})
test('failed opening never mutates input or charges a player', () => {
  const start = world()
  start.players.a.balance = 20
  assert.throws(() => run(start, 'a', 'open', { pack: 'origin', count: 1 }))
  assert.equal(start.players.a.balance, 20)
  assert.equal(Object.keys(start.cards).length, 2)
})
test('Limited serials and Perfect serials unique in authoritative creation order', () => {
  const limited = {
    ...pack,
    id: 'limited',
    limited: true,
    slug: 'test-release',
    stock: 20,
    edition: 60,
    qualifyingTier: 'Godly Secret' as const,
    odds: {
      rarity: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100],
      quality: [0, 0, 0, 0, 0, 100],
      grade: 100,
      mutation: 0,
      effect: 0,
    },
  }
  let w = world()
  const cards: Card[] = []
  for (let i = 0; i < 3; i++) {
    const r = run(
      w,
      'a',
      'open',
      { pack: 'limited', count: 1 },
      { ...env, random: () => 0.999999, packs: [limited] },
    )
    w = r.state
    cards.push(...r.result.cards!)
  }
  assert.deepEqual(
    cards.map((c) => c.attributes.serial),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  )
  assert.deepEqual(
    cards.map((c) => c.perfectSerial),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  )
})
test('stock exhausted rejects atomically', () => {
  const p = { ...pack, limited: true, stock: 1 }
  const first = run(world(), 'a', 'open', { pack: 'origin', count: 1 }, { ...env, packs: [p] })
  assert.throws(() =>
    run(first.state, 'a', 'open', { pack: 'origin', count: 1 }, { ...env, packs: [p] }),
  )
})
test('non-owners cannot sell, list or offer cards', () => {
  for (const [action, fields] of [
    ['quickSell', { cards: ['two'] }],
    ['list', { card: 'two', price: 100 }],
    ['trade', { to: 'b', fromCards: ['two'], toCards: [], fromCoins: 0, toCoins: 0 }],
  ] as const)
    assert.throws(() => run(world(), 'a', action, fields))
})
test('quick sale credits exactly once and burns card permanently', () => {
  const cmd = { action: 'quickSell', key: 'sale-once', cards: ['one'] },
    first = applyCommand(world(), 'a', cmd, env)
  assert.equal(first.state.cards.one.status, 'burned')
  assert.equal(first.state.players.a.balance, 12662)
  assert.deepEqual(applyCommand(first.state, 'a', cmd, env), first)
  assert.throws(() => run(first.state, 'a', 'quickSell', { cards: ['one'] }))
})
test('quick-sell accepts a full 50-card opening and rejects oversized, stale and unavailable batches atomically', () => {
  const w = world()
  const cards = Array.from({ length: 50 }, (_, i) => `opening-card-${i}`)
  for (const id of cards) w.cards[id] = { ...structuredClone(w.cards.one), id }
  const expectedQsv = 50 * w.cards.one.snapshot.qsv
  const cmd = { action: 'quickSell', key: 'sell-full-opening', cards, expectedQsv }
  const sold = applyCommand(w, 'a', cmd, env)
  assert.equal(sold.state.players.a.balance, w.players.a.balance + expectedQsv)
  assert(cards.every(id => sold.state.cards[id].status === 'burned'))
  assert.deepEqual(applyCommand(sold.state, 'a', cmd, env), sold)
  assert.throws(() => run(w, 'a', 'quickSell', { cards: [...cards, 'one'] }), /selection/)
  assert.throws(() => run(w, 'a', 'quickSell', { cards: ['one', 'one'] }), /selection/)
  assert.throws(() => run(w, 'a', 'quickSell', { cards, expectedQsv: expectedQsv + 1 }), /value changed/)
  w.cards[cards[49]].status = 'locked'
  assert.throws(() => applyCommand(w, 'a', cmd, env), /not available/)
  assert(cards.slice(0, 49).every(id => w.cards[id].status === 'owned'))
})
test('duplicate quick-sell retains the best design copy, preserves special and unavailable cards, and handles more than 50 extras', () => {
  const w = world(), original = w.cards.one
  const add = (id: string, data: Partial<typeof original> = {}) => {
    w.cards[id] = { ...structuredClone(original), id, designId: 'design-a', ...data }
  }
  add('best', { attributes: { ...original.attributes, baseValue: 50000 } })
  add('listed', { status: 'listed' })
  add('limited', { attributes: { ...original.attributes, limited: true, serial: 1 } })
  add('perfect', { perfectSerial: 1 })
  add('other-player', { owner: 'b' })
  add('same-name-other-design', { designId: 'design-b' })
  const extras = Array.from({ length: 65 }, (_, i) => `extra-${i}`)
  for (const id of extras) add(id)
  const quote = () => duplicateSaleQuote(Object.values(w.cards), 'a', c => calculateValue(c.attributes, env.rules))
  const expected = quote()
  assert.deepEqual(expected.ids, [...extras].sort())
  w.cards[extras[0]].status = 'displayed'
  assert.throws(() => run(w, 'a', 'quickSellDuplicates', { quote: expected.token }), /duplicates or their sale values changed/)
  w.cards[extras[0]].status = 'owned'
  const sold = run(w, 'a', 'quickSellDuplicates', { quote: expected.token, cards: ['listed', 'one'] }).state
  assert(extras.every(id => sold.cards[id].status === 'burned'))
  assert.equal(sold.players.a.balance, w.players.a.balance + expected.credits)
  for (const id of ['best', 'listed', 'limited', 'perfect', 'other-player', 'same-name-other-design', 'one'])
    assert.deepEqual(sold.cards[id], w.cards[id])
  assert.throws(() => run(sold, 'a', 'quickSellDuplicates', { quote: expected.token }), /changed/)
})
test('duplicate quote detects different card IDs even when count and payout are unchanged', () => {
  const w = world(), original = w.cards.one
  w.cards.a1 = { ...original, designId: 'a', id: 'a1' }
  w.cards.a2 = { ...original, designId: 'a', id: 'a2' }
  const quote = () => duplicateSaleQuote(Object.values(w.cards), 'a', c => c.snapshot)
  const before = quote()
  w.cards.a2.status = 'burned'
  w.cards.a3 = { ...original, designId: 'a', id: 'a3' }
  const after = quote()
  assert.equal(before.credits, after.credits)
  assert.notEqual(before.token, after.token)
})
test('market purchase atomically debits, credits minus disclosed fee and transfers exactly once', () => {
  const listed = run(world(), 'a', 'list', { card: 'one', price: 1000 }).state,
    listing = Object.values(listed.listings)[0]
  assert.throws(() => run(listed, 'a', 'buy', { listing: listing.id, price: 1000 }))
  const bought = run(listed, 'b', 'buy', { listing: listing.id, price: 1000 }).state
  assert.equal(bought.players.a.balance, 13450)
  assert.equal(bought.players.b.balance, 11500)
  assert.equal(bought.cards.one.owner, 'b')
  assert.equal(bought.sales.length, 1)
  assert.throws(() => run(bought, 'c', 'buy', { listing: listing.id, price: 1000 }))
})
test('pending trade reserves sender; counterparty reserves on confirmation; edit invalidates accepts', () => {
  const r = run(world(), 'a', 'trade', {
      to: 'b',
      fromCards: ['one'],
      toCards: ['two'],
      fromCoins: 100,
      toCoins: 200,
    }),
    id = r.result.trade!
  assert.equal(r.state.cards.one.status, 'locked')
  assert.equal(r.state.cards.two.status, 'owned')
  assert.equal(r.state.players.a.balance, 12400)
  assert.equal(r.state.players.b.balance, 12500)
  assert.throws(() => run(r.state, 'a', 'list', { card: 'one', price: 100 }))
  const accepted = run(r.state, 'b', 'acceptTrade', { trade: id, revision: 1 }).state
  assert.equal(accepted.cards.two.status, 'locked')
  assert.equal(accepted.players.b.balance, 12300)
  const edited = run(accepted, 'a', 'editTrade', {
    trade: id,
    to: 'b',
    fromCards: ['one'],
    toCards: ['two'],
    fromCoins: 50,
    toCoins: 100,
  }).state
  assert.equal(edited.trades[id].revision, 2)
  assert.deepEqual(edited.trades[id].accepted, [])
  assert.equal(edited.players.a.balance, 12450)
  assert.equal(edited.players.b.balance, 12500)
  assert.throws(() => run(edited, 'b', 'acceptTrade', { trade: id, revision: 1 }))
})
test('both parties confirm exact trade; execution once and cancellation releases escrow', () => {
  const r = run(world(), 'a', 'trade', {
      to: 'b',
      fromCards: ['one'],
      toCards: ['two'],
      fromCoins: 100,
      toCoins: 200,
    }),
    id = r.result.trade!
  const a = run(r.state, 'a', 'acceptTrade', { trade: id, revision: 1 }).state
  const b = run(a, 'b', 'acceptTrade', { trade: id, revision: 1 }).state
  assert.equal(b.cards.one.owner, 'b')
  assert.equal(b.cards.two.owner, 'a')
  assert.equal(b.players.a.balance, 12600)
  assert.equal(b.players.b.balance, 12400)
  assert.equal(b.trades[id].status, 'completed')
  assert.throws(() => run(b, 'a', 'acceptTrade', { trade: id, revision: 1 }))
  const cancelled = run(r.state, 'a', 'cancelTrade', { trade: id, revision: 1 }).state
  assert.equal(cancelled.players.a.balance, 12500)
  assert.equal(cancelled.players.b.balance, 12500)
  assert.equal(cancelled.cards.one.status, 'owned')
})
test('simulated confirmation is disabled; seeded collectors cannot receive or complete new trades', () => {
  const w = world()
  const r = run(w, 'a', 'trade', {
    to: 'b',
    fromCards: ['one'],
    toCards: [],
    fromCoins: 0,
    toCoins: 0,
  })
  assert.throws(() => run(r.state, 'a', 'demoReview', { trade: r.result.trade, revision: 1 }))
  const historical = structuredClone(r.state)
  historical.players.b.demo = true
  assert.throws(() => run(historical, 'a', 'acceptTrade', { trade: r.result.trade, revision: 1 }))
  assert.equal(
    run(historical, 'a', 'cancelTrade', { trade: r.result.trade, revision: 1 }).state.trades[
      r.result.trade!
    ].status,
    'cancelled',
  )
  assert.throws(() =>
    run(w, 'a', 'trade', {
      to: 'demo-seeded',
      fromCards: [],
      toCards: [],
      fromCoins: 0,
      toCoins: 1000,
    }),
  )
  assert.throws(() => run(w, 'a', 'demoReview', { trade: 'seeded-offer', revision: 1 }))
})
test('daily reward, slot cooldown, spending limits and disabled slots enforced', () => {
  const first = run(world(), 'a', 'daily').state
  assert.equal(first.players.a.balance, 12550)
  assert.throws(() => run(first, 'a', 'daily'))
  const spun = run(first, 'a', 'spin').state
  assert.throws(() => run(spun, 'a', 'spin'))
  spun.players.a.spendLimit = 0
  assert.throws(() => run(spun, 'a', 'spin', {}, { ...env, now: env.now + 10000 }))
  assert.throws(() =>
    run(
      first,
      'a',
      'spin',
      {},
      { ...env, rules: { ...rules, slots: { ...rules.slots, enabled: false } } },
    ),
  )
})

test('signup grants 500 once, replay and subsequent join never reset balances or history', () => {
  const created = run(emptyWorld(), 'new-player', 'join', { name: 'New collector' })
  assert.equal(created.state.players['new-player'].balance, 500)
  assert.equal(created.state.ledger.length, 1)
  const daily = run(created.state, 'new-player', 'daily')
  assert.equal(daily.state.players['new-player'].balance, 550)
  const joined = run(daily.state, 'new-player', 'join', { name: 'New collector' })
  assert.equal(joined.state.players['new-player'].balance, 550)
  assert.deepEqual(joined.state.ledger, daily.state.ledger)
})

test('slots have increased disclosed rewards, a hard persisted 20-play daily limit, and validated rewards', () => {
  assert.equal(rules.slots.cost, 10)
  assert.equal(rules.slots.dailyLimit, 20)
  const expectedReward = rules.slots.rewards.reduce(
    (sum, r) => sum + (r.amount * r.weight) / 100,
    0,
  )
  assert.equal(expectedReward, 10.5)
  let w = world()
  for (let i = 0; i < 20; i++)
    w = run(w, 'a', 'spin', {}, { ...env, now: env.now + i * 6000 }).state
  assert.equal(w.players.a.spins, 20)
  assert.throws(
    () => run(w, 'a', 'spin', {}, { ...env, now: env.now + 20 * 6000 }),
    /Daily play limit/,
  )
  assert(!validateRules({ ...rules, rewards: { starter: -1, daily: 50 } }))
  assert(!validateRules({ ...rules, rewards: { starter: 500, daily: 0.5 } }))
})

test('grading is one-time, charges exact fee, and preserves the immutable opening value', () => {
  const start = world()
  start.cards.one.attributes = { rarity: 'Rare', quality: 'Normal', grade: null }
  start.cards.one.snapshot = calculateValue(start.cards.one.attributes, rules)
  const initial = structuredClone(start.cards.one.snapshot)
  const cmd = { action: 'grade', key: 'grade-once', card: 'one', expectedFee: 25, confirm: true }
  const graded = applyCommand(start, 'a', cmd, { ...env, random: () => 0.99999 })
  assert.equal(graded.state.players.a.balance, 12475)
  assert.equal(graded.state.cards.one.attributes.grade, 10)
  assert.deepEqual(graded.state.cards.one.snapshot, initial)
  assert.equal(graded.state.expansion!.grades[0].after.tv, 500)
  assert.deepEqual(applyCommand(graded.state, 'a', cmd, env), graded)
  assert.throws(() =>
    run(graded.state, 'a', 'grade', { card: 'one', expectedFee: 50, confirm: true }),
  )
  assert.throws(() => run(start, 'b', 'grade', { card: 'one', expectedFee: 25, confirm: true }))
  assert.throws(() => run(start, 'a', 'grade', { card: 'one', expectedFee: 1, confirm: true }))
})
test('grading can lower value, enforces minimum fee, and newly Perfect cards receive permanent serials', () => {
  const start = world()
  start.cards.one.attributes = { rarity: 'Extraordinary', quality: 'Mint Condition' }
  start.cards.one.snapshot = calculateValue(start.cards.one.attributes, rules)
  const first = run(
    start,
    'a',
    'grade',
    { card: 'one', expectedFee: 3600, confirm: true },
    { ...env, random: () => 0.9999 },
  )
  assert.equal(first.state.cards.one.perfectSerial, 1)
  assert.equal(first.state.expansion!.grades[0].after.perfect, true)
  assert.equal(first.state.cards.one.snapshot.perfect, false)
  const low = world()
  low.cards.one.attributes = { rarity: 'Common', quality: 'Normal' }
  low.cards.one.snapshot = calculateValue(low.cards.one.attributes, rules)
  assert.equal(gradingFee(30, rules), 10)
  const downgraded = run(
    low,
    'a',
    'grade',
    { card: 'one', expectedFee: 10, confirm: true },
    { ...env, random: () => 0 },
  )
  assert.equal(downgraded.state.expansion!.grades[0].after.tv, 7)
  assert.equal(downgraded.state.cards.one.snapshot.tv, 30)
})
test('display locks the exact card and pays one fifth only for full server-timed intervals', () => {
  const displayed = run(world(), 'a', 'display', { card: 'one', confirm: true }).state
  assert.equal(displayed.cards.one.status, 'displayed')
  for (const [action, fields] of [
    ['quickSell', { cards: ['one'] }],
    ['list', { card: 'one', price: 100 }],
    ['createAuction', { card: 'one', startingBid: 10, seconds: 30, confirm: true }],
    ['grade', { card: 'one', expectedFee: 25, confirm: true }],
    ['trade', { to: 'b', fromCards: ['one'], toCards: [], fromCoins: 0, toCoins: 0 }],
  ] as const)
    assert.throws(() => run(displayed, 'a', action, fields))
  assert.throws(() => run(displayed, 'a', 'display', { card: 'one', confirm: true }))
  assert.throws(() => run(displayed, 'a', 'claimDisplay', {}, { ...env, now: env.now + 299999 }))
  const cmd = { action: 'claimDisplay', key: 'display-once' }
  const paid = applyCommand(displayed, 'a', cmd, { ...env, now: env.now + 300000 })
  assert.equal(paid.state.players.a.balance, 12550)
  assert.deepEqual(applyCommand(paid.state, 'a', cmd, { ...env, now: env.now + 600000 }), paid)
  assert.throws(() => run(paid.state, 'a', 'claimDisplay', {}, { ...env, now: env.now + 300000 }))
  const withdrew = run(paid.state, 'a', 'withdrawDisplay', {}, { ...env, now: env.now + 750000 })
  assert.equal(withdrew.state.players.a.balance, 12600)
  assert.equal(withdrew.state.cards.one.status, 'owned')
  assert.equal(withdrew.state.expansion!.displays.a, undefined)
  const again = run(
    withdrew.state,
    'a',
    'display',
    { card: 'one', confirm: true },
    { ...env, now: env.now + 750000 },
  )
  assert.equal(again.state.expansion!.displays.a.startedAt, env.now + 750000)
})
test('display sessions preserve rate across config changes and safely accrue across sessions', () => {
  const displayed = run(world(), 'a', 'display', { card: 'one', confirm: true }).state
  const changed = structuredClone(rules)
  changed.expansion!.displayDivisor = 10
  const paid = run(
    displayed,
    'a',
    'claimDisplay',
    {},
    { ...env, now: env.now + 86400000, rules: changed },
  )
  assert.equal(paid.state.players.a.balance, 12500 + 288 * 50)
  assert.equal(paid.state.expansion!.displays.a.payout, 50)
})
test('collection jobs ignore client rewards and enforce persisted cooldown, daily limit, and UTC reset', () => {
  let w = world()
  for (let i = 0; i < 20; i++)
    w = run(
      w,
      'a',
      'job',
      { task: 'catalog', confirm: true, reward: 999999 },
      { ...env, now: env.now + i * 60000 },
    ).state
  assert.equal(w.players.a.balance, 12800)
  assert.equal(w.expansion!.jobs.a.count, 20)
  assert.throws(() =>
    run(w, 'a', 'job', { task: 'catalog', confirm: true }, { ...env, now: env.now + 20 * 60000 }),
  )
  const next = run(
    w,
    'a',
    'job',
    { task: 'catalog', confirm: true },
    { ...env, now: env.now + 86400000 },
  )
  assert.equal(next.state.expansion!.jobs.a.count, 1)
  assert.throws(() =>
    run(
      next.state,
      'a',
      'job',
      { task: 'catalog', confirm: true },
      { ...env, now: env.now + 86400001 },
    ),
  )
})
function listedAuction() {
  const w = run(world(), 'a', 'createAuction', {
    card: 'one',
    startingBid: 100,
    seconds: 30,
    confirm: true,
  }).state
  return { w, id: Object.keys(w.expansion!.auctions)[0] }
}
test('card auctions escrow credits, refund outbid players, charge only the difference on a raise', () => {
  const { w, id } = listedAuction()
  assert.equal(w.cards.one.status, 'auctioned')
  assert.throws(() => run(w, 'a', 'bid', { auction: id, amount: 100, confirm: true }))
  assert.throws(() => run(w, 'b', 'bid', { auction: id, amount: 99, confirm: true }))
  const b = run(w, 'b', 'bid', { auction: id, amount: 100, confirm: true }).state
  assert.equal(b.players.b.balance, 12400)
  const c = run(b, 'c', 'bid', { auction: id, amount: 150, confirm: true }).state
  assert.equal(c.players.b.balance, 12500)
  assert.equal(c.players.c.balance, 12350)
  const raise = run(c, 'c', 'bid', { auction: id, amount: 200, confirm: true }).state
  assert.equal(raise.players.c.balance, 12300)
  assert.throws(() => run(raise, 'a', 'cancelAuction', { auction: id }))
  assert.throws(() => run(raise, 'b', 'quickSell', { cards: ['one'] }))
})
test('auction settlement transfers exactly once, records a comparable sale, and preserves fee history', () => {
  const { w, id } = listedAuction()
  const b = run(w, 'b', 'bid', { auction: id, amount: 100, confirm: true }).state
  const settled = run(b, 'a', 'tick', {}, { ...env, now: env.now + 30001 }).state
  assert.equal(settled.cards.one.owner, 'b')
  assert.equal(settled.cards.one.status, 'owned')
  assert.equal(settled.players.a.balance, 12595)
  assert.equal(settled.players.b.balance, 12400)
  assert.equal(settled.sales.length, 1)
  assert.equal(settled.sales[0].amount, 100)
  assert.equal(marketValue(attrs, 250, settled.sales, env.now + 30001).value, 100)
  assert.equal(
    run(settled, 'c', 'tick', {}, { ...env, now: env.now + 40000 }).state.players.a.balance,
    12595,
  )
  assert.throws(() =>
    run(
      settled,
      'c',
      'bid',
      { auction: id, amount: 200, confirm: true },
      { ...env, now: env.now + 40000 },
    ),
  )
})
test('unsold auctions and zero-bid cancellations return cards; only sellers may cancel', () => {
  const { w, id } = listedAuction()
  assert.throws(() => run(w, 'b', 'cancelAuction', { auction: id }))
  const canceled = run(w, 'a', 'cancelAuction', { auction: id }).state
  assert.equal(canceled.cards.one.status, 'owned')
  const expired = run(w, 'c', 'tick', {}, { ...env, now: env.now + 30000 }).state
  assert.equal(expired.expansion!.auctions[id].status, 'unsold')
  assert.equal(expired.cards.one.owner, 'a')
})
test('late bids extend deadlines within a finite extension cap and minimum bids increase monotonically', () => {
  const { w, id } = listedAuction()
  const late = run(
    w,
    'b',
    'bid',
    { auction: id, amount: 100, confirm: true },
    { ...env, now: env.now + 29000 },
  ).state
  assert.equal(late.expansion!.auctions[id].endsAt, env.now + 44000)
  assert.equal(late.expansion!.auctions[id].extensions, 1)
  assert.equal(minimumBid(late.expansion!.auctions[id]), 105)
  const next = run(
    late,
    'c',
    'bid',
    { auction: id, amount: 105, confirm: true },
    { ...env, now: env.now + 43000 },
  ).state
  assert.equal(next.expansion!.auctions[id].endsAt, env.now + 58000)
})
test('concurrent bids use the same production append gate and never double-reserve a losing bidder', async () => {
  const { w, id } = listedAuction()
  let stored: Revision = { sequence: 0, state: w }
  const store = {
    read: async () => structuredClone(stored),
    append: async (next: Revision) => {
      await Promise.resolve()
      if (next.sequence !== stored.sequence + 1) throw Error('Sequence conflict')
      stored = structuredClone(next)
    },
  }
  await Promise.allSettled(
    [
      ['b', 100],
      ['c', 150],
    ].map(([actor, value]) =>
      commitAtomic(
        store,
        String(actor),
        { action: 'bid', key: randomUUID(), auction: id, amount: value, confirm: true },
        () => env,
      ),
    ),
  )
  assert.equal(stored.state.expansion!.auctions[id].bids.at(-1)!.amount, 150)
  assert.equal(stored.state.players.b.balance, 12500)
  assert.equal(stored.state.players.c.balance, 12350)
})
test('mystery rooms replace NPC seats, never expose budgets or sealed prizes, and reject late joins', () => {
  let w = world()
  w.players.d = { ...w.players.c, id: 'd', name: 'd' }
  w = run(w, 'a', 'createStorage').state
  const id = Object.keys(w.expansion!.auctions)[0]
  assert.equal(w.expansion!.auctions[id].seats!.filter((s) => s.npc).length, 3)
  const json = JSON.stringify(expansionView(w, 'b', rules))
  assert(!json.includes('"budget"'))
  assert(!json.includes('"prize"'))
  assert(!json.includes('"nextNpcAt"'))
  for (const actor of ['b', 'c', 'd']) w = run(w, actor, 'joinStorage', { auction: id }).state
  assert.equal(w.expansion!.auctions[id].seats!.filter((s) => s.npc).length, 0)
  assert.throws(() => run(w, 'a', 'createStorage'))
  assert.throws(() => run(w, 'b', 'joinStorage', { auction: id }, { ...env, now: env.now + 16000 }))
  assert.throws(() => run(w, 'demo-seeded', 'joinStorage', { auction: id }))
})
test('player storage win delivers sealed money/cards/packs once; reward packs cannot be replayed', () => {
  const created = run(world(), 'a', 'createStorage').state
  const id = Object.keys(created.expansion!.auctions)[0]
  assert.throws(() => run(created, 'a', 'bid', { auction: id, amount: 1000, confirm: true }))
  const bidState = run(
    created,
    'a',
    'bid',
    { auction: id, amount: 1000, confirm: true },
    { ...env, now: env.now + 15000 },
  ).state
  const settled = run(bidState, 'b', 'tick', {}, { ...env, now: env.now + 180000 }).state
  const auction = settled.expansion!.auctions[id]
  assert.equal(auction.status, 'sold')
  assert.equal(settled.players.a.balance, 11600)
  assert.equal(auction.rewardCards!.length, 2)
  assert.equal(auction.rewardPacks!.length, 1)
  assert.equal(Object.keys(settled.cards).length, 4)
  for (const id of auction.rewardCards!) {
    const card = settled.cards[id]
    assert(
      designs.some(
        (d) =>
          d.id === card.designId && d.name === card.name && d.rarity === card.attributes.rarity,
      ),
    )
  }
  assert.equal(expansionView(settled, 'b', rules).auctions[0]?.prize, undefined)
  assert(expansionView(settled, 'a', rules).auctions[0].prize)
  const reward = auction.rewardPacks![0]
  assert.throws(() => run(settled, 'b', 'openRewardPack', { reward }))
  const opened = run(settled, 'a', 'openRewardPack', { reward })
  assert.equal(opened.result.cards!.length, 3)
  assert.equal(opened.state.players.a.balance, 11600)
  assert.equal(opened.result.receipt!.cost, 0)
  for (const card of opened.result.cards!)
    assert(
      designs.some(
        (d) =>
          d.id === card.designId && d.name === card.name && d.rarity === card.attributes.rarity,
      ),
    )
  assert.throws(() => run(opened.state, 'a', 'openRewardPack', { reward }))
})
test('NPC bids are storage-only, never spend a player wallet, and can win without awarding free player loot', () => {
  const created = run(world(), 'a', 'createStorage').state
  const id = Object.keys(created.expansion!.auctions)[0]
  const settled = run(created, 'b', 'tick', {}, { ...env, now: env.now + 180000 }).state
  const auction = settled.expansion!.auctions[id]
  assert(auction.bids.length)
  assert(auction.bids.at(-1)!.npc)
  assert(auction.bids.every((b) => b.amount <= 450))
  assert.equal(settled.players.a.balance, 12500)
  assert.equal(Object.keys(settled.cards).length, 2)
  assert.equal(Object.keys(settled.expansion!.packs).length, 0)
  assert.equal(settled.sales.length, 0)
})
test('chat validates bodies, rate limits per account, hides only after distinct reports, and keeps reports private', () => {
  const start = world()
  start.players.d = { ...start.players.c, id: 'd', name: 'd' }
  for (const body of ['', 'x'.repeat(281), '\u0001bad'])
    assert.throws(() => run(start, 'a', 'chat', { body }))
  const first = run(start, 'a', 'chat', {
    body: '<script>literal plain text</script>',
    player: 'b',
    name: 'Forged operator',
  }).state
  const message = first.expansion!.messages[0]
  assert.equal(message.player, 'a')
  assert.equal(message.name, 'a')
  assert.throws(() => run(first, 'a', 'chat', { body: 'too fast' }))
  let reported = first
  for (const actor of ['b', 'b', 'c'])
    reported = run(reported, actor, 'reportChat', { message: message.id }).state
  assert(!reported.expansion!.messages[0].hidden)
  reported = run(reported, 'd', 'reportChat', { message: message.id }).state
  assert(reported.expansion!.messages[0].hidden)
  const publicView = expansionView(reported, 'a', rules)
  assert.equal(publicView.messages[0].body, '[Message hidden by moderation]')
  assert(!JSON.stringify(publicView).includes('"reports"'))
  assert.throws(() =>
    run(first, 'a', 'moderateChat', { message: message.id, reason: 'Not an admin' }),
  )
})
test('expansion configuration validates boundaries while legacy worlds remain backward compatible', () => {
  assert(validateRules(rules))
  assert(!validateRules({ ...rules, expansion: { ...expansionRules(rules), displayDivisor: 0 } }))
  assert(
    !validateRules({ ...rules, expansion: { ...expansionRules(rules), storageMaximumPacks: 99 } }),
  )
  const legacy = world()
  assert.equal(legacy.expansion, undefined)
  assert.equal(expansionView(legacy, 'a', rules).auctions.length, 0)
  assert.deepEqual(decodeSnapshot(encodeSnapshot(legacy)), legacy)
  assert.deepEqual(
    decodeSnapshot(
      encodeSnapshot(run(legacy, 'a', 'job', { task: 'catalog', confirm: true }).state),
    ).players.b,
    legacy.players.b,
  )
})
test('operator actions reject non-admin environment, bad confirmation and missing reason', () => {
  const cmd = {
    operation: 'grantCurrency',
    target: 'a',
    amount: 500,
    reason: 'Support test',
    confirmation: 'CONFIRM',
  }
  assert.throws(() => run(world(), 'a', 'admin', cmd))
  assert.throws(() =>
    run(world(), 'operator', 'admin', { ...cmd, confirmation: 'no' }, { ...env, operator: true }),
  )
  const granted = run(world(), 'operator', 'admin', cmd, { ...env, operator: true })
  assert.equal(granted.state.players.a.balance, 13000)
  assert(granted.result.audit)
  const removed = run(
    granted.state,
    'operator',
    'admin',
    { ...cmd, operation: 'removeCard', card: 'one' },
    { ...env, operator: true },
  )
  assert.equal(removed.state.cards.one.status, 'burned')
  assert.throws(() =>
    run(
      granted.state,
      'operator',
      'admin',
      { ...cmd, operation: 'removeCard', card: 'two' },
      { ...env, operator: true },
    ),
  )
})

test('concurrent Limited openings allocate unique serials through the production commit retry loop', async () => {
  const limited: Pack = {
    ...pack,
    id: 'limited',
    slug: 'concurrent-release',
    limited: true,
    stock: 20,
    edition: 60,
  }
  let stored: Revision = { sequence: 0, state: world() }
  const store = {
    read: async () => structuredClone(stored),
    append: async (next: Revision) => {
      await Promise.resolve()
      if (next.sequence !== stored.sequence + 1) throw new Error('Unique sequence conflict')
      stored = structuredClone(next)
    },
  }
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      commitAtomic(
        store,
        'a',
        { action: 'open', key: randomUUID(), pack: 'limited', count: 1 },
        () => ({ ...env, packs: [limited] }),
      ),
    ),
  )
  const serials = results.flatMap((r) => r.cards!.map((c) => c.attributes.serial!))
  assert.equal(new Set(serials).size, 18)
  assert.deepEqual(
    serials.sort((a, b) => a - b),
    Array.from({ length: 18 }, (_, i) => i + 1),
  )
  assert.equal(stored.sequence, 6)
  assert.equal(stored.state.players.a.balance, 11000)
})
test('expired offers return reserved assets on a durable cleanup command', () => {
  const created = run(world(), 'a', 'trade', {
    to: 'b',
    fromCards: ['one'],
    toCards: ['two'],
    fromCoins: 100,
    toCoins: 200,
  })
  const id = created.result.trade!
  const accepted = run(created.state, 'b', 'acceptTrade', { trade: id, revision: 1 }).state
  const cleaned = run(accepted, 'a', 'expire', {}, { ...env, now: env.now + 86400001 }).state
  assert.equal(cleaned.trades[id].status, 'expired')
  assert.equal(cleaned.players.a.balance, 12500)
  assert.equal(cleaned.players.b.balance, 12500)
  assert.equal(cleaned.cards.one.status, 'owned')
  assert.equal(cleaned.cards.two.status, 'owned')
  const expanded = run(
    accepted,
    'a',
    'job',
    { task: 'catalog', confirm: true },
    { ...env, now: env.now + 86400001 },
  ).state
  assert.equal(expanded.trades[id].status, 'expired')
  assert.equal(expanded.players.a.balance, 12515)
  assert.equal(expanded.cards.two.status, 'owned')
})
test('disabled effects never roll, but remain valid for historical cards', () => {
  const config = structuredClone(rules)
  config.effects.Starlight.enabled = false
  for (let i = 0; i < 20; i++)
    assert.equal(
      rollAttributes({ ...odds, effect: 100 }, config, () => 0.1).effect,
      'First Edition',
    )
  assert(calculateValue({ ...attrs, effect: 'Starlight' }, config).tv > 250)
})
test('changed pack price or Quick Sell total requires a new confirmation without partial writes', () => {
  const w = world()
  assert.throws(() => run(w, 'a', 'open', { pack: 'origin', count: 1, expectedPrice: 200 }))
  assert.throws(() => run(w, 'a', 'quickSell', { cards: ['one'], expectedQsv: 1 }))
  assert.equal(w.cards.one.status, 'owned')
  assert.equal(w.players.a.balance, 12500)
})
test('large fractional value products use exact fixed-point arithmetic and round only once', () => {
  const a: Attributes = {
    rarity: 'Godly Secret',
    quality: 'Mint Condition',
    grade: 10,
    mutation: 'Black Pearl',
    effect: 'Starlight',
    limited: true,
    serial: 1,
    qualifyingTier: 'Godly Secret',
  }
  const snapshot = calculateValue(a, rules)
  const exact = (400000n * 2n * 2n * 7n * 15n * 2n * 1615n * 3n * 55n) / (10n * 100n * 10n)
  assert.equal(snapshot.tv, Number(exact))
  assert.equal(snapshot.qsv, Number((exact * 65n) / 100n))
})

test('versioned compressed snapshots round-trip losslessly and keep legacy commits readable', () => {
  const w = world()
  assert.deepEqual(decodeSnapshot(w), w)
  const legacy = { encoding: 'gzip-base64-v1' as const, data: gzipSync(JSON.stringify(w)).toString('base64') }
  assert.deepEqual(decodeSnapshot(legacy), w)
  assert.deepEqual(decodeSnapshot(encodeSnapshot(w)), w)
  assert.throws(() => decodeSnapshot({ encoding: 'unknown', data: '' }))
  assert.throws(() => decodeSnapshot({ encoding: 'gzip-base64-v1', data: 'invalid' }))
})
test('chunked snapshots round-trip raw worlds larger than the 16 MiB runtime Buffer limit', () => {
  const w = world()
  w.cards.one.source = 'x'.repeat(16 * 1024 * 1024 + 1024)
  const raw = JSON.stringify(w)
  assert(raw.length > 16 * 1024 * 1024)
  const encoded = encodeSnapshot(w)
  assert(encoded.data.length < 1_000_000)
  assert.deepEqual(decodeSnapshot(encoded), w)
})
test('a world exceeding the backend raw-document limit fits in the compressed event envelope', () => {
  const w = world()
  for (let i = 0; i < 1000; i++) w.cards[`stress-${i}`] = card(`stress-${i}`, 'a')
  const raw = JSON.stringify(w),
    encoded = encodeSnapshot(w)
  assert(Buffer.byteLength(raw) > 204800)
  assert(Buffer.byteLength(JSON.stringify(encoded)) < 40000)
  assert.deepEqual(decodeSnapshot(encoded), w)
})

test('case stock, distinct-player, lifetime, UTC daily and cooldown limits share the card/currency commit', () => {
  const limitedEnv = {
    ...env,
    packs: [
      {
        ...pack,
        stock: 5,
        maxDistinctPlayers: 1,
        perPlayerLimit: 3,
        perPlayerDailyLimit: 2,
        cooldownSeconds: 60,
      },
    ],
  }
  const before = world()
  const first = run(before, 'a', 'open', { pack: 'origin', count: 1 }, limitedEnv).state
  assert.equal(first.players.a.balance, before.players.a.balance - pack.price)
  assert.throws(
    () => run(first, 'b', 'open', { pack: 'origin', count: 1 }, limitedEnv),
    /distinct-collector/,
  )
  assert.throws(() => run(first, 'a', 'open', { pack: 'origin', count: 1 }, limitedEnv), /cooldown/)
  const later = { ...limitedEnv, now: env.now + 60000 }
  const second = run(first, 'a', 'open', { pack: 'origin', count: 1 }, later).state
  assert.throws(
    () =>
      run(second, 'a', 'open', { pack: 'origin', count: 1 }, { ...later, now: env.now + 120000 }),
    /UTC daily/,
  )
  const third = run(
    second,
    'a',
    'open',
    { pack: 'origin', count: 1 },
    { ...later, now: env.now + 86400000 },
  ).state
  assert.throws(
    () =>
      run(third, 'a', 'open', { pack: 'origin', count: 1 }, { ...later, now: env.now + 86460000 }),
    /lifetime/,
  )
  assert.throws(
    () =>
      run(
        before,
        'a',
        'open',
        { pack: 'origin', count: 2 },
        { ...env, packs: [{ ...pack, stock: 1 }] },
      ),
    /sold out/,
  )
  assert.throws(
    () =>
      run(
        before,
        'a',
        'open',
        { pack: 'origin', count: 1 },
        { ...env, packs: [{ ...pack, ends: new Date(env.now).toISOString() }] },
      ),
    /opening window/,
  )
  assert.equal(before.players.a.balance, 12500)
  assert.equal(Object.keys(before.cards).length, 2)
})

test('assigned custom cards pin their base, guarantees and visuals without changing existing cards', () => {
  const custom: CardDesign = { id:'custom',slug:'custom-archive',name:'Archive of Dawn',description:'A first light kept forever.',
    rarity:'Extraordinary',enabled:true,availability:'assigned-only',baseValue:777,
    defaults:{quality:'Mint Condition',grade:10,mutation:'Chrome',effect:'First Edition'},visual:{color:'emerald'} }
  const customEnv={...env,designs:[...designs,custom],packs:[{...pack,pool:[{designId:'custom',name:custom.name,rarity:custom.rarity,weight:100}]}]}
  const original=world()
  const opened=run(original,'a','open',{pack:'origin',count:1},customEnv)
  const pulled=opened.result.cards![0]
  assert.equal(pulled.name,custom.name)
  assert.equal(pulled.description,custom.description)
  assert.equal(pulled.attributes.baseValue,777)
  assert.equal(pulled.attributes.mutation,'Chrome')
  assert.equal(pulled.attributes.grade,10)
  assert(pulled.snapshot.perfect)
  assert(pulled.perfectSerial)
  assert.match(pulled.snapshot.steps[0].label,/custom mint-time base/)
  assert.deepEqual(pulled.visual,{color:'emerald'})
  custom.baseValue=999999;custom.name='Renamed future design'
  assert.equal(calculateValue(pulled.attributes,upgradedRules(rules)).tv,pulled.snapshot.tv)
  assert.equal(pulled.name,'Archive of Dawn')
  assert.deepEqual(opened.state.cards.one,original.cards.one)
  assert(!Array.from({length:30},()=>drawCardDesign('Extraordinary',[...designs,custom],()=>0.99)).some(d=>d.id==='custom'))
  const invalid={...customEnv,packs:[{...customEnv.packs[0],pool:[{...customEnv.packs[0].pool[0],weight:90}]}]}
  assert.throws(()=>run(original,'a','open',{pack:'origin',count:1},invalid),/total 100/)
  assert.equal(original.players.a.balance,12500)
})
test('case disclosure reports final weighted guarantees, including otherwise disabled mutation roll weights', () => {
  const special:CardDesign={id:'forced',slug:'forced',name:'Forced',rarity:'Rare',enabled:true,availability:'assigned-only',baseValue:900,
    defaults:{quality:'Mint Condition',mutation:'Black Pearl',grade:10,effect:null}}
  const neutral:CardDesign={id:'neutral',slug:'neutral',name:'Neutral',rarity:'Common',enabled:true,availability:'assigned-only',
    defaults:{quality:'Normal',mutation:null,grade:null,effect:null}}
  const config=structuredClone(rules)
  config.mutationWeights!['Holo Foil']+=config.mutationWeights!['Black Pearl']
  config.mutationWeights!['Black Pearl']=0
  const shown=disclosePack({...pack,pool:[
    {designId:'forced',name:'Forced',rarity:'Rare',weight:30},
    {designId:'neutral',name:'Neutral',rarity:'Common',weight:70},
  ]},[special,neutral],config)
  assert.equal(shown.displayOdds?.mutation,30)
  assert.equal(shown.displayOdds?.grade,30)
  assert.equal(shown.displayOdds?.effect,0)
  assert.equal(shown.displayOdds?.quality[5],30)
  assert.equal(shown.displayOdds?.quality[2],70)
  assert.equal(shown.mutationOdds?.find(m=>m.name==='Black Pearl')?.weight,100)
  assert.equal(shown.overrides?.length,2)
})
test('confirmed compensation adds only verified top-ups once and preserves all held assets/history', () => {
  const original=world()
  original.ledger.push(
    {id:'welcome-a',player:'a',amount:500,reason:'Welcome grant · play credits only',at:'2026-01-01T00:00:00.000Z'},
    {id:'welcome-b',player:'b',amount:1250,reason:'Welcome grant · play credits only',at:'2026-01-01T00:00:00.000Z'},
  )
  original.cards.one.status='locked'
  original.trades.held={id:'held',from:'a',to:'b',fromCards:['one'],toCards:[],fromCoins:100,toCoins:0,
    accepted:[],revision:1,status:'pending',createdAt:'2026-01-01',expires:'2026-01-02'}
  const preview=upgradePreview(original)
  assert.equal(preview.total,1250)
  assert.equal(preview.eligible,2)
  assert.equal(preview.reviewRequired,1)
  const cmd={action:'economyUpgrade',key:'upgrade-approved',reason:'Approved progression rollout',confirmation:'CONFIRM'}
  assert.throws(()=>applyCommand(original,'a',cmd,env),/operator/)
  const applied=applyCommand(original,'a',cmd,{...env,operator:true})
  assert.equal(applied.state.players.a.balance,13500)
  assert.equal(applied.state.players.b.balance,12750)
  assert.equal(applied.state.players.c.balance,12500)
  assert.equal(applied.state.players['demo-seeded'].balance,12500)
  assert.deepEqual(applied.state.cards,original.cards)
  assert.deepEqual(applied.state.trades,original.trades)
  assert.deepEqual(applied.state.receipts,original.receipts)
  assert.equal(applied.state.ledger.length,original.ledger.length+2)
  assert(applied.state.counters[upgradeMarker])
  assert.equal(applyCommand(applied.state,'a',{...cmd,key:'upgrade-again'},{...env,operator:true}).state,applied.state)
  assert.equal(original.players.a.balance,12500)
})
test('enhanced daily streaks, sorting income and objective rewards are durable and exactly once', () => {
  const config=upgradedRules(rules),newEnv={...env,rules:config}
  const joined=run(emptyWorld(),'new','join',{name:'New collector'},newEnv).state
  assert.equal(joined.players.new.balance,1250)
  let state=run(joined,'new','daily',{},newEnv).state
  assert.equal(state.players.new.balance,1475)
  state=run(state,'new','daily',{}, {...newEnv,now:env.now+86400000}).state
  assert.equal(state.players.new.balance,1725)
  assert.equal(state.players.new.dailyStreak,2)
  let work=world()
  for(let i=0;i<3;i++)work=run(work,'a','job',{task:'catalog',confirm:true},{...newEnv,now:env.now+i*30000}).state
  assert.equal(work.players.a.balance,12680)
  assert.equal(progressionView(work,'a',env.now)?.quests.find(q=>q.id==='work')?.progress,3)
  const cmd={action:'claimQuest',key:'objective-claim-once',quest:'work'}
  const claimed=applyCommand(work,'a',cmd,newEnv)
  assert.equal(claimed.state.players.a.balance,12805)
  assert.deepEqual(applyCommand(claimed.state,'a',cmd,newEnv).result,claimed.result)
  assert.throws(()=>applyCommand(claimed.state,'a',{...cmd,key:'another-claim-key'},newEnv),/already claimed/)
  assert.throws(()=>applyCommand(claimed.state,'a',{...cmd,key:'next-day-claim'}, {...newEnv,now:env.now+86400000}),/Complete/)
})
test('support card grants use real designs, immutable bases, safe quantities and authorization', () => {
  const design:CardDesign={id:'support-design',name:'Support prism',slug:'support-prism',rarity:'Rare',
    enabled:true,baseValue:123,defaults:{quality:'Mint Condition'},visual:{color:'blue'}}
  const command={target:'b',operation:'grantCard',design:'support-design',quantity:3,
    attributes:{grade:7},confirmation:'CONFIRM',reason:'Verified support correction'}
  const granted=run(world(),'a','admin',command,{...env,operator:true,designs:[design]})
  assert.equal(granted.result.cards?.length,3)
  assert(granted.result.cards?.every(c=>c.name==='Support prism'&&c.attributes.baseValue===123&&c.attributes.quality==='Mint Condition'))
  assert.throws(()=>run(world(),'a','admin',{...command,quantity:51},{...env,operator:true,designs:[design]}),/1 and 50/)
  assert.throws(()=>run(world(),'a','admin',command,{...env,designs:[design]}),/Operator/)
})
test('studio validates full allowlisted design/case input before privileged storage', () => {
  assert.throws(()=>validateDesign({name:'Card',slug:'card',rarity:'Common',updated_by:'forged'},rules),/unsupported/)
  assert.throws(()=>validateDesign({name:'Card',slug:'card',rarity:'Common',base_value_override:-1},rules),/whole number/)
  const valid=validateDesign({name:'Custom',slug:'custom',rarity:'Epic',default_attributes:{mutation:'Black Pearl'}},rules)
  assert.equal(valid.default_attributes.mutation,'Black Pearl')
  assert.throws(()=>validateCase({name:'Case',slug:'case',price:100,cards_per_opening:3,pool_mode:'assigned',odds},[{design_id:'one',weight:80}]),/100%/)
  assert.throws(()=>validateCase({name:'Case',slug:'case',price:0,cards_per_opening:3,odds},[]),/whole number/)
})

test('Limited custom namespaces, not editable display slugs, allocate permanent serials', () => {
  const limited={...pack,limited:true,stock:1,edition:3,serialScope:'curated-namespace',qualifyingTier:'Extraordinary' as const}
  const opened=run(world(),'a','open',{pack:'origin',count:1},{...env,packs:[limited]})
  assert(opened.result.cards?.every(c=>c.attributes.release==='curated-namespace'))
  assert.deepEqual(opened.result.cards?.map(c=>c.attributes.serial),[1,2,3])
  assert.equal(opened.state.counters['limited:curated-namespace'],3)
  assert.equal(opened.state.counters['limited:origin'],undefined)
})

test('ten-pack openings debit and mint once; eleven and fractional quantities fail atomically', () => {
  const original=world()
  const command={action:'open',key:'ten-pack-once',pack:pack.id,count:10,expectedPrice:2500}
  const opened=applyCommand(original,'a',command,env)
  assert.equal(opened.result.cards?.length,30)
  assert.equal(opened.state.players.a.balance,10000)
  assert.equal(opened.state.receipts.length,1)
  assert.deepEqual(applyCommand(opened.state,'a',command,env).result,opened.result)
  assert.throws(()=>run(original,'a','open',{pack:pack.id,count:11}),/1–10/)
  assert.throws(()=>run(original,'a','open',{pack:pack.id,count:1.5}))
  assert.equal(original.players.a.balance,12500)
})
test('mint, Limited and Perfect numbers are per design, shared across owners and continued above legacy numbers', () => {
  const w=world()
  const make=(id:string,designId:string,owner='a')=>{
    const c={...card(id,owner),designId,attributes:{...attrs,limited:true,release:'holiday-series',serial:undefined}}
    assignSerials(w,c,true);w.cards[id]=c;return c
  }
  const a=make('new-a','design-a'),b=make('new-b','design-b'),a2=make('new-a2','design-a','b')
  assert.deepEqual([a.serial,b.serial,a2.serial],[1,1,2])
  assert.deepEqual([a.attributes.serial,b.attributes.serial,a2.attributes.serial],[1,1,2])
  assert.deepEqual([a.perfectSerial,b.perfectSerial,a2.perfectSerial],[1,1,2])
  const legacy={...card('legacy','a'),designId:'legacy-design',perfectSerial:78,
    attributes:{...attrs,limited:true,release:'legacy-release',serial:120}}
  w.cards.legacy=legacy
  const next={...card('next','b'),designId:'legacy-design',
    attributes:{...attrs,limited:true,release:'legacy-release',serial:undefined}}
  assignSerials(w,next,true)
  assert.equal(next.attributes.serial,121)
  assert.equal(next.perfectSerial,79)
  assert.equal(w.cards.legacy.attributes.serial,120)
})
test('progression gates pack price and guaranteed rarities without changing random pack odds', () => {
  const w=world(),config=upgradedRules(rules),expensive={...pack,price:2500}
  const initial=advancement(w,'a',config)
  assert.equal(initial.level,1)
  assert(packLock(expensive,initial,config))
  assert.throws(()=>run(w,'a','open',{pack:pack.id,count:1},{...env,rules:config,packs:[expensive]}),/Unlock/)
  w.counters['xp:a']=xpForLevel(3)
  const ready=advancement(w,'a',config)
  assert.equal(packLock(expensive,ready,config),'')
  const guaranteed={...pack,price:100,pool:[{designId:'secret-design',name:'Secret',rarity:'Secret' as const,weight:100}]}
  assert(packLock(guaranteed,ready,config))
  assert.deepEqual(expensive.odds,pack.odds)
  w.counters['peak-worth:a']=100000;w.counters['xp:a']=xpForLevel(10);w.players.a.balance=0
  assert.equal(advancement(w,'a',config).tier,'Vaultkeeper')
})
test('net worth includes card ownership and every escrow once; stats match the same wealth', () => {
  let w=run(world(),'a','createAuction',{card:'one',startingBid:100,seconds:60,confirm:true}).state
  const id=Object.keys(w.expansion!.auctions)[0]
  w=run(w,'b','bid',{auction:id,amount:100,confirm:true}).state
  assert.equal(advancement(w,'b',rules).netWorth,12500+calculateValue(attrs,rules).tv)
  const projected=projectWorld(w,rules)
  assert.equal(projected.stats.b.balance+projected.stats.b.collectionValue,advancement(w,'b',rules).netWorth)
})

test('world projection reuses current card snapshots and recalculates stale inputs or rule versions', () => {
  const w = world()
  const original = w.cards.one
  const current = projectWorld(w, rules)
  assert.equal(current.cards.one.snapshot, original.snapshot)

  w.cards.one = { ...original, snapshot: { ...original.snapshot, version: 'older-rules' } }
  const staleVersion = projectWorld(w, rules)
  assert.notEqual(staleVersion.cards.one.snapshot, w.cards.one.snapshot)
  assert.equal(staleVersion.cards.one.snapshot.version, rules.version)

  w.cards.one = { ...original, attributes: { ...original.attributes, grade: 8 } }
  const staleInputs = projectWorld(w, rules)
  assert.notEqual(staleInputs.cards.one.snapshot, original.snapshot)
  assert.deepEqual(staleInputs.cards.one.snapshot.inputs, w.cards.one.attributes)
})
test('higher slot tiers require both level and wealth and enhanced slots disclose doubled rewards', () => {
  const config=upgradedRules(rules)
  assert.equal(slotConfiguration(config).rewards[4].amount,rules.slots.rewards[4].amount*2)
  assert.equal(slotConfiguration(config,'gold').cost,rules.slots.cost*25)
  assert.throws(()=>run(world(),'a','spin',{tier:'gold'},{...env,rules:config}),/Unlock/)
  const w=world();w.counters['xp:a']=xpForLevel(6);w.counters['peak-worth:a']=25000
  const spun=run(w,'a','spin',{tier:'gold'},{...env,rules:config,random:()=>0.999})
  assert.equal(spun.result.spin?.amount,rules.slots.rewards[4].amount*50)
  assert.equal(spun.state.counters['casino-spend:a:2026-11-17'],250)
})
test('NPCs never bid above 85 percent of sealed reference value and a player can win without sniping', () => {
  const original=run(world(),'a','createStorage',{}, {...env,random:()=>0}).state
  const a=Object.values(original.expansion!.auctions)[0]
  assert.equal(a.npcBudgetCap,Math.floor(storageValue(a,rules)*0.85))
  assert(a.seats!.filter(s=>s.npc).every(s=>s.budget!<=a.npcBudgetCap!))
  const bid=run(original,'a','bid',{auction:a.id,amount:a.npcBudgetCap!+1,confirm:true},{...env,now:a.startsAt+1}).state
  const settled=run(bid,'a','tick',{}, {...env,now:a.endsAt+1000}).state
  const won=settled.expansion!.auctions[a.id]
  assert.equal(won.status,'sold');assert.equal(won.bids.at(-1)?.bidder,'a')
  assert(won.bids.filter(b=>b.npc).every(b=>b.amount<=won.npcBudgetCap!))
  assert.throws(()=>run(world(),'a','createStorage',{tier:'treasury'}),/Unlock/)
})
const battlePack={...pack,price:100}
const battleEnv={...env,packs:[battlePack]}
function lobby(w=world(),mode='highest',seats=2) {
  return run(w,'a','createBattle',{packs:[pack.id,pack.id],seats,mode,expectedPrice:200,expectedCatalog:'test'},battleEnv).state
}
test('battle reserves entry, hides private catalog, accepts saved terms and settles cards exactly once', () => {
  const w=lobby(),id=Object.keys(w.casino!.battles)[0]
  assert.equal(w.players.a.balance,12300)
  assert.equal(advancement(w,'a',rules).netWorth,12500+calculateValue(attrs,rules).tv)
  assert.equal('designs' in casinoView(w,'b',env.now).battles[0],false)
  assert.throws(()=>run(w,'a','joinBattle',{battle:id,expectedPrice:200},battleEnv),/seat/)
  const cmd={action:'joinBattle',key:'final-join-once',battle:id,expectedPrice:200}
  const settled=applyCommand(w,'b',cmd,{...battleEnv,packs:[],designs:[]})
  const battle=settled.state.casino!.battles[id]
  assert.equal(battle.status,'complete');assert.equal(battle.scores?.length,2)
  assert.equal(Object.keys(settled.state.cards).length,14)
  assert.equal(settled.state.players.b.balance,12300)
  assert.equal(settled.state.ledger.filter(l=>l.reason.startsWith('Pack battle entry')).length,2)
  assert.deepEqual(applyCommand(settled.state,'b',cmd,battleEnv).result,settled.result)
  assert.throws(()=>run(settled.state,'c','joinBattle',{battle:id,expectedPrice:200},battleEnv),/no longer/)
})
test('every battle mode supports three players, tie sharing and immutable lineup snapshots', () => {
  for(const mode of ['highest','lowest','shared','final-round']) {
    let w=lobby(world(),mode,3),id=Object.keys(w.casino!.battles)[0]
    w=run(w,'b','joinBattle',{battle:id,expectedPrice:200},battleEnv).state
    assert.equal(w.casino!.battles[id].status,'waiting')
    w=run(w,'c','joinBattle',{battle:id,expectedPrice:200},battleEnv).state
    const b=w.casino!.battles[id]
    assert.equal(b.status,'complete');assert.equal(b.winners?.length,3)
    for(const p of ['a','b','c'])assert.equal(Object.values(w.cards).filter(c=>c.owner===p&&c.source.startsWith('Pack battle')).length,6)
  }
})
test('unfilled battles refund on server catch-up; only the host can cancel and no refund can replay', () => {
  const w=lobby(),id=Object.keys(w.casino!.battles)[0]
  assert.throws(()=>run(w,'b','cancelBattle',{battle:id},battleEnv),/host/)
  const canceled=run(w,'a','cancelBattle',{battle:id},battleEnv).state
  assert.equal(canceled.players.a.balance,12500)
  assert.throws(()=>run(canceled,'a','cancelBattle',{battle:id},battleEnv),/no longer/)
  const expired=run(w,'b','tick',{}, {...battleEnv,now:env.now+600001}).state
  assert.equal(expired.players.a.balance,12500)
  assert.equal(expired.casino!.battles[id].status,'cancelled')
  assert.equal(expired.counters['casino-spend:a:2026-11-17'],200)
})
test('battle rejects unavailable/limited packs, malformed inputs, stale prices and insufficient entry balances', () => {
  for(const p of [{...battlePack,limited:true},{...battlePack,stock:10},{...battlePack,enabled:false},{...battlePack,perPlayerLimit:2}])
    assert.throws(()=>run(world(),'a','createBattle',{packs:[pack.id],seats:2,mode:'highest',expectedPrice:100},{...env,packs:[p]}))
  assert.throws(()=>run(world(),'a','createBattle',{packs:[pack.id],seats:9,mode:'highest',expectedPrice:100},battleEnv))
  assert.throws(()=>run(world(),'a','createBattle',{packs:[pack.id],seats:2,mode:'highest',expectedPrice:99},battleEnv),/price/)
  const w=world();w.players.a.balance=0
  assert.throws(()=>lobby(w),/Not enough/)
  assert.equal(w.casino,undefined)
})
test('blackjack values handle multiple aces and persisted hands never reveal the shoe or dealer hole card', () => {
  assert.equal(handValue(['AH','AS','9C']),21)
  assert.equal(handValue(['AH','AS','KC']),12)
  let w=world()
  // Seed a known authoritative hand to test resolution, secrecy and stale-request checks.
  w.casino={battles:{},hands:{a:{id:'known-hand',bet:100,player:['10H','7S'],dealer:['10C','6D'],deck:['9H','2S'],status:'playing',payout:0}}}
  const publicHand=casinoView(w,'a',env.now).hand!
  assert.deepEqual(publicHand.dealer,['10C','?']);assert.equal('deck' in publicHand,false)
  assert.throws(()=>run(w,'a','blackjackHit',{hand:'previous-hand'}),/changed/)
  assert.throws(()=>run(w,'a','blackjack',{bet:10}),/Finish/)
  w=run(w,'a','blackjackStand',{hand:'known-hand'}).state
  assert.equal(w.casino!.hands.a.status,'lost')
  assert.deepEqual(casinoView(w,'a',env.now).hand?.dealer,['10C','6D','2S'])
  assert.throws(()=>run(w,'a','blackjackStand',{hand:'known-hand'}),/Start/)
})
test('blackjack wins and pushes pay only once, busts pay zero and new decks contain 52 distinct cards', () => {
  for(const [dealer,deck,expected,payout] of [
    [['10H','6S'],['10C'],'won',200],
    [['10H','7S'],[],'push',100],
  ] as const) {
    const w=world()
    w.casino={battles:{},hands:{a:{id:'test-hand',bet:100,player:['10D','7C'],dealer:[...dealer],deck:[...deck],status:'playing',payout:0}}}
    const result=run(w,'a','blackjackStand',{hand:'test-hand'})
    assert.equal(result.state.casino!.hands.a.status,expected)
    assert.equal(result.state.players.a.balance,12500+payout)
  }
  const w=run(world(),'a','blackjack',{bet:10}).state,h=w.casino!.hands.a
  assert.equal(new Set([...h.deck,...h.player,...h.dealer]).size,52)
})
test('Plinko bin probabilities disclose 92.1875 percent return before rounding, with no client-chosen outcome', () => {
  const weights=[1,8,28,56,70,56,28,8,1]
  assert.equal(weights.reduce((n,w,i)=>n+w*plinkoMultipliers[i],0)/256,.921875)
  const w=run(world(),'a','plinko',{bet:10,bin:0,payout:1e9},{...env,random:()=>0.6})
  assert.equal(w.state.players.a.balance,12590)
  assert.match(w.result.message,/10×/)
  assert.equal(advancement(w.state,'a',rules).xp,0)
  for(const bet of [0,-1,1.5,1001,Infinity])assert.throws(()=>run(world(),'a','plinko',{bet}))
  const limited=world();limited.players.a.spendLimit=0
  assert.throws(()=>run(limited,'a','plinko',{bet:10}),/spending/)
})
test('cosmetic authoring allows seasonal/custom VFX without creating packs or accepting injected fields', () => {
  const data=validateDesign({name:'Holiday test',slug:'holiday-test',rarity:'Rare',
    visual_config:{color:'#123456',theme:'thanksgiving',finish:'filigree',vfx:'embers',effectName:'Harvest glow',mutationName:'Autumn foil'}},rules)
  assert.equal(data.visual_config.vfx,'embers')
  assert.throws(()=>validateDesign({name:'Bad visual',slug:'bad',rarity:'Rare',visual_config:{vfx:'javascript:alert(1)'}},rules))
  assert.throws(()=>validateDesign({name:'Bad visual',slug:'bad',rarity:'Rare',visual_config:{html:'<script/>'}},rules),/unsupported/)
})

test('released case usage comes from durable counters, including actual Limited mint totals after card-count edits',()=>{
  const w=world(),id='case-with:punctuation'
  w.counters[`stock:${id}`]=4;w.counters['limited:fixed-namespace']=8
  w.counters[`case:${id}:distinct`]=2
  w.counters[`case:${id}:player:a`]=3
  w.counters[`case:${id}:player:b`]=1
  w.counters[`case:${id}:player:a:day:2026-11-17`]=2
  const usage=caseUsage(w,id,1,'fixed-namespace',env.now)
  assert.deepEqual(usage,{openings:4,minted:8,distinct:2,maxLifetime:3,maxDaily:2,day:'2026-11-17'})
  const input={name:'Edited case',slug:'edited-case',kind:'limited',price:100,cards_per_opening:2,
    pool_mode:'rarity',odds,max_total_openings:10,edition_cap:20}
  assert.equal(validateCase(input,[],usage).data.edition_cap,20)
  assert.throws(()=>validateCase({...input,edition_cap:19},[],usage),/already minted/)
  assert.throws(()=>validateCase({...input,max_total_openings:3},[],usage),/already used/)
  assert.throws(()=>validateCase({...input,per_player_limit:2},[],usage),/existing usage/)
  assert.throws(()=>validateCase({...input,per_player_daily_limit:1},[],usage),/today/)
})
test('Limited edition checks guard actual card supply independently of opening stock',()=>{
  const w=world()
  w.counters['stock:origin']=2;w.counters['limited:fixed-scope']=6
  const limited={...pack,limited:true,stock:100,edition:7,serialScope:'fixed-scope'}
  assert.throws(()=>run(w,'a','open',{pack:pack.id,count:1},{...env,packs:[limited]}),/Limited card edition/)
  assert.equal(w.players.a.balance,12500)
})
