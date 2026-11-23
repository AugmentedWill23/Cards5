import type { Attributes, PackOdds, Rules, Sale, ValueSnapshot } from './rules'
import type { ExpansionState, ExpansionView } from './expansion-types'
export type ID = string | number
export const maxQuickSellCards = 50
export type CardDesign = {
  id: ID
  slug: string
  name: string
  description?: string
  rarity: Attributes['rarity']
  enabled: boolean
  revision?: number
  availability?: 'standard' | 'assigned-only' | 'limited-only'
  baseValue?: number | null
  defaults?: Partial<Pick<Attributes, 'quality' | 'grade' | 'mutation' | 'effect'>>
  visual?: import('./visuals').VisualConfig
}
export type Card = {
  serial?: number
  designId?: ID
  designSlug?: string
  id: string
  name: string
  description?: string
  owner: string
  attributes: Attributes
  snapshot: ValueSnapshot
  openingSnapshot?: ValueSnapshot
  createdAt: string
  source: string
  status: 'owned' | 'listed' | 'locked' | 'burned' | 'displayed' | 'auctioned'
  gradedAt?: string
  perfectSerial?: number
  provenance: { at: string; action: string; from?: string; to?: string }[]
  visual?: CardDesign['visual']
}
export type Player = {
  id: string
  name: string
  balance: number
  demo: boolean
  joined: string
  lastDaily?: string
  lastSpin?: number
  spinDay?: string
  spins?: number
  spendLimit?: number
  hidden?: boolean
  notifications?: boolean
  privateCollection?: boolean
  suspended?: boolean
  dailyStreak?: number
}
export type Listing = {
  id: string
  card: string
  seller: string
  price: number
  status: 'active' | 'sold' | 'cancelled'
  createdAt: string
  buyer?: string
}
export type Trade = {
  id: string
  from: string
  to: string
  fromCards: string[]
  toCards: string[]
  fromCoins: number
  toCoins: number
  toReserved?: boolean
  revision: number
  accepted: string[]
  status: 'pending' | 'completed' | 'declined' | 'cancelled' | 'expired'
  expires: string
  createdAt: string
}
export type Receipt = {
  id: string
  player: string
  pack: string
  cards: string[]
  cost: number
  at: string
}
export type Ledger = { id: string; player: string; amount: number; reason: string; at: string }
export type World = {
  casino?: import('./casino').CasinoState
  expansion?: ExpansionState
  players: Record<string, Player>
  cards: Record<string, Card>
  listings: Record<string, Listing>
  trades: Record<string, Trade>
  receipts: Receipt[]
  ledger: Ledger[]
  sales: (Sale & { seller: string; buyer: string; card: string })[]
  counters: Record<string, number>
  requests: Record<string, { player: string; result: CommandResult }>
}
export type Pack = {
  visual?: import('./visuals').VisualConfig
  lockedReason?: string
  id: ID
  name: string
  slug: string
  price: number
  count: number
  subtitle: string
  color: string
  odds: PackOdds
  limited?: boolean
  stock?: number | null
  remainingStock?: number | null
  edition?: number | null
  starts?: string | null
  ends?: string | null
  qualifyingTier?: Attributes['rarity']
  maxDistinctPlayers?: number | null
  perPlayerLimit?: number | null
  perPlayerDailyLimit?: number | null
  cooldownSeconds?: number | null
  serialScope?: string | null
  enabled: boolean
  pool?: { designId: string; name: string; rarity: Attributes['rarity']; weight: number }[]
  displayOdds?: PackOdds
  overrides?: { name: string; defaults: CardDesign['defaults']; baseValue?: number | null }[]
  mutationOdds?: { name: string; weight: number; multiplier: number }[]
}
export type CommandResult = {
  message: string
  cards?: Card[]
  receipt?: Receipt
  spin?: { amount: number; symbols: string[] }
  trade?: string
  audit?: {
    actor: string
    target: string
    reason: string
    operation: string
    at: string
    before: Player
    after: Player
  }
}
export type GameCommand = { action: string; key: string; [key: string]: unknown }
export type GameView = {
  duplicateSale?: { ids: string[]; credits: number; token: string }
  casino?: import('./casino').CasinoView
  designs?: CardDesign[]
  expansion?: ExpansionView
  serverTime?: number
  player: Player
  preview: boolean
  cards: Card[]
  publicCards: Card[]
  listings: (Listing & { cardData: Card; sellerName: string })[]
  trades: Trade[]
  players: Player[]
  receipts: Receipt[]
  ledger: Ledger[]
  sales: World['sales']
  packs: Pack[]
  rules: Rules
  updates: {
    id: ID
    title: string
    category: string
    summary: string
    details?: string | null
    publishedAt: string
  }[]
  sequence: number
  catalogRevision?: string
  progression?: {
    advancement?: import('./advancement').ReturnAdvancement
    streak: number
    quests: { id: string; title: string; progress: number; target: number; reward: number; claimed: boolean }[]
  }
}
export function emptyWorld(): World {
  return {
    players: {},
    cards: {},
    listings: {},
    trades: {},
    receipts: [],
    ledger: [],
    sales: [],
    counters: {},
    requests: {},
  }
}
