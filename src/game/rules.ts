import type { ExpansionRules } from './expansion-types'

export const rarities = [
  'Dumpster Dive',
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
  'Mythical',
  'Extraordinary',
  'Extreme',
  'Sudo-Secret',
  'Secret',
  'Godly Secret',
] as const
export const qualities = [
  'Torn',
  'Crumpled',
  'Normal',
  'Above Average',
  'High Quality',
  'Mint Condition',
] as const
export const legacyMutations = [
  'Holo Foil',
  'Shiny',
  'Beaming',
  'Gold',
  'Rainbow',
  'Blue Gem',
  'Black Pearl',
] as const
export const mutations = [
  'Etched',
  'Holo Foil',
  'Chrome',
  'Shiny',
  'Prismatic',
  'Beaming',
  'Emberglass',
  'Gold',
  'Aurora',
  'Rainbow',
  'Stardust',
  'Blue Gem',
  'Void Opal',
  'Black Pearl',
] as const
const legacyMutationWeights = [45, 25, 15, 8, 4, 2, 1]
export type Rarity = (typeof rarities)[number]
export type Quality = (typeof qualities)[number]
export type Mutation = (typeof mutations)[number]
export type Attributes = {
  rarity: Rarity
  quality: Quality
  grade?: number | null
  mutation?: Mutation | null
  effect?: string | null
  limited?: boolean
  serial?: number | null
  release?: string
  edition?: number
  qualifyingTier?: Rarity
  /** Immutable mint-time custom base. Editing a design never changes an owned card. */
  baseValue?: number
}
export type Rules = {
  expansion?: ExpansionRules
  version: string
  rewards?: { starter: number; daily: number }
  rarity: Record<string, number>
  quality: Record<string, number>
  grade: number[]
  mutation: Record<string, number>
  mutationWeights?: Record<string, number>
  effects: Record<
    string,
    { multiplier: number; description: string; enabled?: boolean; archived?: boolean }
  >
  perfect: number
  limited: number
  qsv: number
  fee: number
  serial: { threshold: number; bonus: number; exact?: boolean }[]
  slots: {
    enabled: boolean
    cost: number
    cooldown: number
    dailyLimit: number
    reminderMinutes?: number
    rewards: { amount: number; weight: number; symbols: string[] }[]
  }
}
export const defaultRules: Rules = {
  version: '2.1.0',
  expansion: {
    gradingFeeBps: 1000,
    gradingMinimum: 10,
    displaySeconds: 300,
    displayDivisor: 5,
    jobReward: 15,
    jobCooldownSeconds: 60,
    jobDailyLimit: 20,
    auctionMinimumSeconds: 30,
    auctionMaximumSeconds: 86400,
    bidIncrementBps: 500,
    softCloseSeconds: 15,
    maximumExtensions: 6,
    storageLobbySeconds: 15,
    storageBiddingSeconds: 75,
    storageStartingBid: 50,
    storageNpcMinimumBudget: 75,
    storageNpcMaximumBudget: 450,
    storageMaximumCash: 200,
    storageMaximumCards: 3,
    storageMaximumPacks: 2,
    storagePackSlugs: ['scrapyard', 'origin', 'prism'],
    chatCooldownSeconds: 3,
  },
  rewards: { starter: 500, daily: 50 },
  rarity: Object.fromEntries(
    rarities.map((r, i) => [
      r,
      [10, 30, 80, 250, 750, 2200, 6500, 18000, 50000, 125000, 150000, 400000][i],
    ]),
  ),
  quality: {
    Torn: 0.35,
    Crumpled: 0.65,
    Normal: 1,
    'Above Average': 1.2,
    'High Quality': 1.5,
    'Mint Condition': 2,
  },
  grade: [0.25, 0.35, 0.45, 0.6, 0.75, 0.9, 1, 1.2, 1.5, 2],
  mutation: {
    Etched: 1.1,
    'Holo Foil': 1.2,
    Chrome: 1.3,
    Shiny: 1.4,
    Prismatic: 1.6,
    Beaming: 1.75,
    Emberglass: 2,
    Gold: 2.25,
    Aurora: 2.6,
    Rainbow: 3,
    Stardust: 3.75,
    'Blue Gem': 4.5,
    'Void Opal': 5.5,
    'Black Pearl': 7,
  },
  mutationWeights: {
    Etched: 10,
    'Holo Foil': 40,
    Chrome: 7,
    Shiny: 20,
    Prismatic: 4,
    Beaming: 7,
    Emberglass: 3,
    Gold: 3,
    Aurora: 2,
    Rainbow: 1.5,
    Stardust: 1,
    'Blue Gem': 0.75,
    'Void Opal': 0.5,
    'Black Pearl': 0.25,
  },
  effects: {
    Starlight: {
      multiplier: 1.5,
      description: 'A luminous echo. Adds 50% to the attribute value.',
    },
    'First Edition': {
      multiplier: 1.25,
      description: 'An early impression. Adds 25% to the attribute value.',
    },
  },
  perfect: 5.5,
  limited: 2,
  qsv: 0.65,
  fee: 0.05,
  serial: [
    { threshold: 500, bonus: 0.15 },
    { threshold: 300, bonus: 0.25 },
    { threshold: 100, bonus: 0.35 },
    { threshold: 75, bonus: 0.45 },
    { threshold: 35, bonus: 0.75 },
    { threshold: 15, bonus: 1.2 },
    { threshold: 4, bonus: 1.5 },
    { threshold: 3, bonus: 2 },
    { threshold: 2, bonus: 3.5 },
    { threshold: 1, bonus: 5 },
  ],
  slots: {
    enabled: true,
    cost: 10,
    cooldown: 5,
    dailyLimit: 20,
    reminderMinutes: 15,
    rewards: [
      { amount: 0, weight: 60, symbols: ['VII', '◇', '✦'] },
      { amount: 10, weight: 25, symbols: ['◇', '◇', 'VII'] },
      { amount: 25, weight: 10, symbols: ['◇', '◇', '◇'] },
      { amount: 75, weight: 4, symbols: ['✦', '✦', '✦'] },
      { amount: 250, weight: 1, symbols: ['VII', 'VII', 'VII'] },
    ],
  },
}
export type ValueSnapshot = {
  version: string
  inputs: Attributes
  steps: { label: string; multiplier?: number; amount: number }[]
  tv: number
  qsv: number
  perfect: boolean
  serialBonus: number
}
export const expansionRules = (rules: Rules): ExpansionRules =>
  rules.expansion ?? defaultRules.expansion!
export function validateExpansionRules(r: ExpansionRules) {
  if (!r || typeof r !== 'object') return false
  const { storagePackSlugs, ...numbers } = r
  return (
    Object.keys(defaultRules.expansion!)
      .filter((key) => key !== 'storagePackSlugs')
      .every((key) => Number.isSafeInteger(numbers[key as keyof typeof numbers])) &&
    Object.values(numbers).every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000) &&
    r.gradingFeeBps <= 10000 &&
    r.gradingMinimum >= 1 &&
    r.displaySeconds >= 1 &&
    r.displayDivisor >= 1 &&
    r.jobCooldownSeconds >= 1 &&
    r.jobDailyLimit >= 1 &&
    r.auctionMinimumSeconds >= 30 &&
    r.auctionMaximumSeconds >= r.auctionMinimumSeconds &&
    r.auctionMaximumSeconds <= 86400 &&
    r.bidIncrementBps >= 1 &&
    r.bidIncrementBps <= 10000 &&
    r.softCloseSeconds >= 1 &&
    r.softCloseSeconds <= 60 &&
    r.maximumExtensions <= 10 &&
    r.storageLobbySeconds >= 5 &&
    r.storageLobbySeconds <= 60 &&
    r.storageBiddingSeconds >= 30 &&
    r.storageBiddingSeconds <= 300 &&
    r.storageStartingBid >= 1 &&
    r.storageNpcMinimumBudget >= r.storageStartingBid &&
    r.storageNpcMaximumBudget >= r.storageNpcMinimumBudget &&
    r.storageMaximumCards <= 5 &&
    r.storageMaximumPacks <= 3 &&
    r.chatCooldownSeconds >= 1 &&
    Array.isArray(storagePackSlugs) &&
    storagePackSlugs.length > 0 &&
    storagePackSlugs.every((s) => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s))
  )
}
export function basisPoints(value: number, bps: number) {
  return Number((BigInt(value) * BigInt(bps)) / 10000n)
}
export function gradingFee(tv: number, rules: Rules) {
  const r = expansionRules(rules)
  return Math.max(r.gradingMinimum, basisPoints(tv, r.gradingFeeBps))
}
export function isPerfect(a: Attributes) {
  return (
    a.grade === 10 &&
    a.quality === 'Mint Condition' &&
    rarities.indexOf(a.limited ? a.qualifyingTier! : a.rarity) >= 7
  )
}
export function serialBonus(serial: number, rules: Rules) {
  if (!Number.isSafeInteger(serial) || serial < 1) throw new Error('Invalid serial number')
  return rules.serial.filter((s) => (s.exact ? serial === s.threshold : serial <= s.threshold))
}
export function calculateValue(a: Attributes, rules: Rules): ValueSnapshot {
  if (!rarities.includes(a.rarity) || !qualities.includes(a.quality))
    throw new Error('A valid rarity and quality are required')
  if (a.grade != null && (!Number.isInteger(a.grade) || a.grade < 1 || a.grade > 10))
    throw new Error('Grade must be 1–10')
  if (a.mutation && !mutations.includes(a.mutation)) throw new Error('Invalid mutation')
  if (a.effect && !rules.effects[a.effect]) throw new Error('Unknown special effect')
  let amount = a.baseValue ?? rules.rarity[a.rarity]
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1e12) throw new Error('Invalid base value')
  // Multipliers have six-decimal fixed-point precision. Currency is integer
  // credits; retain the exact rational product and floor only at the end.
  let numerator = BigInt(amount),
    denominator = 1n
  const steps: ValueSnapshot['steps'] = [{ label: a.baseValue == null ? `${a.rarity} base` : `${a.rarity} · custom mint-time base`, amount }]
  const multiply = (label: string, multiplier: number) => {
    if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('Invalid multiplier')
    const fixed = Math.round(multiplier * 1_000_000)
    if (
      !Number.isSafeInteger(fixed) ||
      fixed < 1 ||
      Math.abs(multiplier * 1_000_000 - fixed) > 1e-5
    )
      throw new Error('Multipliers support at most six decimal places')
    numerator *= BigInt(fixed)
    denominator *= 1_000_000n
    amount = Number(numerator) / Number(denominator)
    steps.push({ label, multiplier, amount })
  }
  multiply(a.quality, rules.quality[a.quality])
  multiply(
    a.grade ? `Grade ${a.grade}` : 'No grade · neutral',
    a.grade ? rules.grade[a.grade - 1] : 1,
  )
  multiply(a.mutation || 'No Mutation', a.mutation ? rules.mutation[a.mutation] : 1)
  multiply(a.effect || 'No special effect', a.effect ? rules.effects[a.effect].multiplier : 1)
  let bonus = 0
  if (a.limited) {
    multiply('Limited release', rules.limited)
    const contributions = serialBonus(a.serial!, rules)
    bonus = contributions.reduce((sum, s) => sum + Math.round(s.bonus * 1_000_000), 0) / 1_000_000
    multiply(
      `Serial #${a.serial}: ${contributions.map((s) => `+${Math.round(s.bonus * 100)}% (${s.exact ? '#' : '≤'}${s.threshold})`).join(' + ')} = +${Math.round(bonus * 100)}%`,
      Math.round((1 + bonus) * 1_000_000) / 1_000_000,
    )
  }
  if (a.rarity === 'Secret') multiply('Secret rarity treatment', 2)
  if (a.rarity === 'Godly Secret') multiply('Godly Secret rarity treatment', 3)
  const perfect = isPerfect(a)
  if (perfect) multiply('Perfect · +450% = 5.5× total', rules.perfect)
  const tv = Number(numerator / denominator)
  if (!Number.isSafeInteger(tv) || tv < 0) throw new Error('Value exceeds safe currency range')
  return {
    version: rules.version,
    inputs: a,
    steps,
    tv,
    qsv: Number((BigInt(tv) * 65n) / 100n),
    perfect,
    serialBonus: bonus,
  }
}
export type PackOdds = {
  rarity: number[]
  grade: number
  mutation: number
  effect: number
  quality: number[]
}
export function validateOdds(o: PackOdds) {
  const validTable = (x: number[], count: number) =>
    Array.isArray(x) &&
    x.length === count &&
    x.every((n) => Number.isFinite(n) && n >= 0) &&
    Math.abs(x.reduce((a, b) => a + b, 0) - 100) < 1e-7
  return (
    !!o &&
    validTable(o.rarity, 12) &&
    validTable(o.quality, 6) &&
    ['grade', 'mutation', 'effect'].every(
      (k) => Number.isFinite(o[k as 'grade']) && o[k as 'grade'] >= 0 && o[k as 'grade'] <= 100,
    ) &&
    o.rarity[9] >= o.rarity[10]
  )
}
export function validateRules(r: Rules) {
  if (r?.expansion && !validateExpansionRules(r.expansion)) return false
  const validMultiplier = (n: number) =>
    Number.isFinite(n) && n > 0 && n <= 1e6 && Math.abs(n * 1e6 - Math.round(n * 1e6)) < 1e-5
  if (
    !r ||
    !r.version ||
    r.qsv !== 0.65 ||
    !validMultiplier(r.perfect) ||
    !validMultiplier(r.limited) ||
    !Number.isFinite(r.fee) ||
    r.fee < 0 ||
    r.fee > 1
  )
    return false
  if (
    !rarities.every(
      (v, i) =>
        Number.isSafeInteger(r.rarity[v]) &&
        r.rarity[v] > 0 &&
        (i === 0 || r.rarity[v] > r.rarity[rarities[i - 1]]),
    )
  )
    return false
  if (
    !qualities.every(
      (v, i) =>
        validMultiplier(r.quality[v]) && (i === 0 || r.quality[v] > r.quality[qualities[i - 1]]),
    )
  )
    return false
  if (
    r.grade.length !== 10 ||
    r.grade[6] !== 1 ||
    !r.grade.every((v, i) => validMultiplier(v) && (!i || v > r.grade[i - 1]))
  )
    return false
  const configuredMutations = mutations.filter((name) => r.mutation[name] != null)
  if (
    !legacyMutations.every((name) => r.mutation[name] != null) ||
    Object.keys(r.mutation).some((name) => !mutations.includes(name as Mutation)) ||
    !configuredMutations.every(
      (v, i) =>
        validMultiplier(r.mutation[v]) &&
        r.mutation[v] > 1 &&
        (!i || r.mutation[v] > r.mutation[configuredMutations[i - 1]]),
    )
  )
    return false
  if (
    r.mutationWeights &&
    (!Object.entries(r.mutationWeights).every(
      ([name, weight]) =>
        configuredMutations.includes(name as Mutation) && Number.isFinite(weight) && weight >= 0,
    ) ||
      Math.abs(Object.values(r.mutationWeights).reduce((sum, weight) => sum + weight, 0) - 100) >
        1e-7)
  )
    return false
  return (
    (r.rewards == null ||
      [r.rewards.starter, r.rewards.daily].every(
        (v) => Number.isSafeInteger(v) && v >= 0 && v <= 1000000,
      )) &&
    r.slots.cost >= 0 &&
    Number.isSafeInteger(r.slots.cost) &&
    Number.isSafeInteger(r.slots.cooldown) &&
    r.slots.cooldown >= 1 &&
    (r.slots.reminderMinutes == null ||
      (Number.isSafeInteger(r.slots.reminderMinutes) &&
        r.slots.reminderMinutes >= 0 &&
        r.slots.reminderMinutes <= 120)) &&
    Number.isSafeInteger(r.slots.dailyLimit) &&
    r.slots.dailyLimit > 0 &&
    Array.isArray(r.serial) &&
    r.serial.length > 0 &&
    r.serial.every(
      (s) =>
        Number.isSafeInteger(s.threshold) &&
        s.threshold >= 1 &&
        Number.isFinite(s.bonus) &&
        s.bonus >= 0 &&
        s.bonus <= 1000,
    ) &&
    r.slots.rewards.every(
      (s) =>
        Number.isSafeInteger(s.amount) &&
        s.amount >= 0 &&
        Number.isFinite(s.weight) &&
        s.weight >= 0 &&
        Array.isArray(s.symbols) &&
        s.symbols.length === 3 &&
        s.symbols.every((x) => typeof x === 'string' && x.length <= 6),
    ) &&
    Math.abs(r.slots.rewards.reduce((n, s) => n + s.weight, 0) - 100) < 1e-7 &&
    Object.values(r.effects).every(
      (e) => validMultiplier(e.multiplier) && typeof e.description === 'string',
    )
  )
}
export function weightedIndex(weights: number[], random: () => number) {
  const n = random() * weights.reduce((a, b) => a + b, 0)
  let sum = 0
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i]
    if (n < sum) return i
  }
  return weights.length - 1
}
export function mutationDistribution(rules: Rules) {
  if (!rules.mutationWeights)
    return legacyMutations.map((name, index) => ({
      name,
      weight: legacyMutationWeights[index],
      multiplier: rules.mutation[name],
    }))
  return mutations
    .map((name) => ({
      name,
      weight: rules.mutationWeights![name] ?? 0,
      multiplier: rules.mutation[name],
    }))
    .filter((entry) => entry.multiplier != null && entry.weight > 0)
}
export function rollAttributes(odds: PackOdds, rules: Rules, random: () => number): Attributes {
  if (!validateOdds(odds)) throw new Error('Pack odds are invalid')
  const effects = Object.keys(rules.effects).filter(
    (e) => rules.effects[e].enabled !== false && !rules.effects[e].archived,
  )
  if (odds.effect > 0 && !effects.length)
    throw new Error('This pack needs at least one enabled special effect')
  const mutationPool = mutationDistribution(rules)
  return {
    rarity: rarities[weightedIndex(odds.rarity, random)],
    quality: qualities[weightedIndex(odds.quality, random)],
    grade: random() * 100 < odds.grade ? 1 + Math.floor(random() * 10) : null,
    mutation:
      random() * 100 < odds.mutation
        ? (mutationPool[
            weightedIndex(
              mutationPool.map((entry) => entry.weight),
              random,
            )
          ]?.name ?? null)
        : null,
    effect:
      random() * 100 < odds.effect ? effects[Math.floor(random() * effects.length)] || null : null,
  }
}
export type Sale = { attributes: Attributes; amount: number; at: string; demo?: boolean }
export function marketValue(a: Attributes, tv: number, sales: Sale[], now = Date.now()) {
  const comparable = sales
    .filter(
      (s) =>
        now - Date.parse(s.at) <= 30 * 86400000 &&
        Date.parse(s.at) <= now &&
        ['rarity', 'quality', 'grade', 'mutation', 'effect', 'release', 'baseValue'].every(
          (k) =>
            (s.attributes[k as keyof Attributes] ?? null) === (a[k as keyof Attributes] ?? null),
        ),
    )
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
    .slice(0, 10)
  return {
    value: comparable.length
      ? Math.floor(comparable.reduce((n, s) => n + s.amount, 0) / comparable.length)
      : tv,
    count: comparable.length,
    lastSale: comparable[0]?.at ?? null,
  }
}
