import type { Attributes, ValueSnapshot } from './rules'
import type { Card, CardDesign, Pack } from './types'

export type ExpansionRules = {
  gradingFeeBps: number
  gradingMinimum: number
  displaySeconds: number
  displayDivisor: number
  jobReward: number
  jobCooldownSeconds: number
  jobDailyLimit: number
  auctionMinimumSeconds: number
  auctionMaximumSeconds: number
  bidIncrementBps: number
  softCloseSeconds: number
  maximumExtensions: number
  storageLobbySeconds: number
  storageBiddingSeconds: number
  storageStartingBid: number
  storageNpcMinimumBudget: number
  storageNpcMaximumBudget: number
  storageMaximumCash: number
  storageMaximumCards: number
  storageMaximumPacks: number
  storagePackSlugs: string[]
  chatCooldownSeconds: number
}
export type GradeReceipt = {
  id: string
  player: string
  card: string
  at: string
  fee: number
  before: ValueSnapshot
  after: ValueSnapshot
}
export type Display = {
  player: string
  card: string
  startedAt: number
  paidThrough: number
  payout: number
  intervalMs: number
  formulaVersion: string
  earned: number
}
export type Bid = { bidder: string; amount: number; at: number; npc: boolean }
export type Auction = {
  npcBudgetCap?: number
  storageTier?: string
  id: string
  kind: 'card' | 'storage'
  title: string
  seller?: string
  card?: string
  startsAt: number
  endsAt: number
  createdAt: number
  startingBid: number
  incrementBps: number
  softCloseSeconds: number
  maximumExtensions: number
  feeBps: number
  extensions: number
  status: 'active' | 'sold' | 'unsold' | 'cancelled'
  bids: Bid[]
  seats?: { id: string; name: string; npc: boolean; budget?: number }[]
  nextNpcAt?: number
  prize?: { cash: number; cards: Attributes[]; packs: Pack[]; cardDesigns?: CardDesign[] }
  rewardCards?: string[]
  rewardPacks?: string[]
}
export type PackEntitlement = {
  id: string
  owner: string
  pack: Pack
  source: string
  opened: boolean
}
export type ChatMessage = {
  id: string
  player: string
  name: string
  body: string
  at: number
  hidden?: boolean
  reports?: string[]
}
export type ExpansionState = {
  grades: GradeReceipt[]
  displays: Record<string, Display>
  jobs: Record<string, { day: string; count: number; lastAt: number; earned: number }>
  auctions: Record<string, Auction>
  packs: Record<string, PackEntitlement>
  messages: ChatMessage[]
  lastChat: Record<string, number>
}
export type AuctionView = Omit<Auction, 'prize' | 'seats' | 'nextNpcAt'> & {
  sellerName?: string
  cardData?: Card
  seats?: { id: string; name: string; npc: boolean }[]
  prize?: Auction['prize']
  minimumBid: number
  highestBidderName?: string
}
export type ExpansionView = {
  auctions: AuctionView[]
  grades: GradeReceipt[]
  displays: (Display & { name: string; cardData: Card })[]
  jobs?: ExpansionState['jobs'][string]
  packs: PackEntitlement[]
  messages: Omit<ChatMessage, 'reports'>[]
}
