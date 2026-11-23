import { basisPoints, calculateValue, expansionRules, gradingFee, rollAttributes } from './rules'
import type { Attributes, Rules } from './rules'
import type { Card, CardDesign, CommandResult, GameCommand, World } from './types'
import type { Auction, AuctionView, ExpansionState, ExpansionView } from './expansion-types'
import type { EngineEnv } from './engine'
import { designAttributes, drawCardDesign } from './designs'
import { assignSerials } from './identity'
import { advancement, assertPackAccess, jobBaseReward } from './advancement'
import { mintPack } from './mint'

export const blankExpansion = (): ExpansionState => ({
  grades: [],
  displays: {},
  jobs: {},
  auctions: {},
  packs: {},
  messages: [],
  lastChat: {},
})
type Tools = {
  money: (player: string, amount: number, reason: string) => void
  owned: (id: string) => Card
  next: (scope: string) => number
}
export const storageTiers = [
  { id: 'salvage', name: 'Salvage Row', level: 1, worth: 0, multiplier: 1 },
  { id: 'archive', name: 'Archive District', level: 6, worth: 25000, multiplier: 5 },
  { id: 'treasury', name: 'Treasury Quarter', level: 15, worth: 500000, multiplier: 20 },
] as const
export function storageValue(a: Auction, rules: Rules) {
  return (a.prize?.cash ?? 0) +
    (a.prize?.cards.reduce((sum, card) => sum + calculateValue(card, rules).tv, 0) ?? 0) +
    (a.prize?.packs.reduce((sum, pack) => sum + pack.price, 0) ?? 0)
}
function fail(message: string): never {
  throw new Error(message)
}
function amount(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1e12)
    fail('Use a positive whole-credit amount no greater than one trillion.')
  return value as number
}
export function minimumBid(auction: Auction) {
  const high = auction.bids.at(-1)
  return high
    ? high.amount + Math.max(1, Math.ceil((high.amount * auction.incrementBps) / 10000))
    : auction.startingBid
}
function mint(
  w: World,
  player: string,
  attributes: Attributes,
  source: string,
  env: EngineEnv,
  tools: Tools,
  savedDesign?: CardDesign,
) {
  const at = new Date(env.now).toISOString()
  const design = savedDesign ?? drawCardDesign(attributes.rarity, env.designs, env.random)
  if (!savedDesign) attributes = designAttributes(attributes, design, env.rules)
  const snapshot = calculateValue(attributes, env.rules)
  const card: Card = {
    id: env.uuid(),
    name: design.name,
    description: design.description,
    designId: design.id,
    designSlug: design.slug,
    visual: design.visual,
    owner: player,
    attributes,
    snapshot,
    createdAt: at,
    source,
    status: 'owned',
    provenance: [{ at, action: source, to: player }],
  }
  assignSerials(w, card)
  w.cards[card.id] = card
  return card
}
function bid(
  w: World,
  auction: Auction,
  bidder: string,
  value: number,
  at: number,
  npc: boolean,
  tools: Tools,
) {
  if (auction.status !== 'active' || at < auction.startsAt || at >= auction.endsAt)
    fail('This auction is not accepting bids.')
  if (bidder === auction.seller) fail('You cannot bid on your own card.')
  if (value < minimumBid(auction))
    fail(`The next bid must be at least ${minimumBid(auction)} credits.`)
  if (auction.bids.length >= 100) fail('This auction has reached its 100-bid safety limit.')
  const high = auction.bids.at(-1)
  if (high && !high.npc)
    tools.money(high.bidder, high.amount, `Auction outbid refund · ${auction.id}`)
  if (!npc) tools.money(bidder, -value, `Auction bid escrow · ${auction.id}`)
  auction.bids.push({ bidder, amount: value, at, npc })
  if (
    !npc &&
    auction.endsAt - at < auction.softCloseSeconds * 1000 &&
    auction.extensions < auction.maximumExtensions
  ) {
    auction.endsAt = at + auction.softCloseSeconds * 1000
    auction.extensions++
  }
}
export function expansionNeedsTick(w: World, now: number) {
  return Object.values(w.casino?.battles ?? {}).some(b => b.status === 'waiting' && b.expiresAt <= now) || Object.values(w.expansion?.auctions ?? {}).some(
    (a) =>
      a.status === 'active' &&
      (a.endsAt <= now || (a.kind === 'storage' && (a.nextNpcAt ?? Infinity) <= now)),
  )
}
// Deadline settlement is run on authenticated reads and before mutations. If
// everyone disconnects, the next request catches up using persisted timestamps.
export function tickExpansion(w: World, env: EngineEnv, tools: Tools) {
  for (const a of Object.values(w.expansion?.auctions ?? {})) {
    if (a.status !== 'active') continue
    if (a.kind === 'storage') {
      // Also cap rooms created before this update; no historical bids are rewritten.
      const value = storageValue(a, env.rules)
      a.npcBudgetCap ??= Math.max(0, Math.floor(value * 0.85))
      for (const seat of a.seats ?? []) if (seat.npc)
        seat.budget = Math.min(seat.budget ?? 0, a.npcBudgetCap)
      let steps = 0
      while ((a.nextNpcAt ?? Infinity) <= env.now && a.nextNpcAt! < a.endsAt && steps++ < 100) {
        const when = a.nextNpcAt!
        a.nextNpcAt = when + 5000
        const high = a.bids.at(-1)
        const eligible = a.seats!.filter(
          (s) => s.npc && s.id !== high?.bidder && s.budget! >= minimumBid(a),
        )
        if (eligible.length && a.bids.length < 100) {
          const npc = eligible[Math.floor(env.random() * eligible.length)]
          bid(w, a, npc.id, minimumBid(a), when, true, tools)
        }
      }
    }
    if (env.now < a.endsAt) continue
    const high = a.bids.at(-1)
    if (!high) {
      a.status = 'unsold'
      if (a.card) w.cards[a.card].status = 'owned'
      continue
    }
    if (a.kind === 'card') {
      const card = w.cards[a.card!]
      if (!card || card.status !== 'auctioned' || card.owner !== a.seller)
        fail('Auction asset integrity check failed.')
      calculateValue(card.attributes, env.rules)
      const fee = basisPoints(high.amount, a.feeBps)
      tools.money(a.seller!, high.amount - fee, `Card auction sale · ${a.id}`)
      w.ledger.push({
        id: env.uuid(),
        player: 'system:market-fees',
        amount: fee,
        reason: `Auction fee · ${a.id}`,
        at: new Date(a.endsAt).toISOString(),
      })
      card.owner = high.bidder
      card.status = 'owned'
      card.provenance.push({
        at: new Date(a.endsAt).toISOString(),
        action: 'Player auction sale',
        from: a.seller,
        to: high.bidder,
      })
      w.sales.push({
        attributes: structuredClone(card.attributes),
        amount: high.amount,
        at: new Date(a.endsAt).toISOString(),
        seller: a.seller!,
        buyer: high.bidder,
        card: card.id,
        demo: false,
      })
    } else if (!high.npc) {
      tools.money(high.bidder, a.prize!.cash, `Storage unit cash · ${a.id}`)
      a.rewardCards = a.prize!.cards.map(
        (attributes, i) =>
          mint(w, high.bidder, attributes, `Mystery storage · ${a.id}`, env, tools, a.prize!.cardDesigns?.[i]).id,
      )
      a.rewardPacks = a.prize!.packs.map((pack) => {
        const id = env.uuid()
        w.expansion!.packs[id] = { id, owner: high.bidder, pack, source: a.id, opened: false }
        return id
      })
    }
    a.status = 'sold'
  }
}

const actions = new Set([
  'grade',
  'display',
  'withdrawDisplay',
  'claimDisplay',
  'job',
  'createAuction',
  'cancelAuction',
  'bid',
  'createStorage',
  'joinStorage',
  'openRewardPack',
  'chat',
  'reportChat',
  'moderateChat',
  'tick',
])
export function applyExpansion(
  w: World,
  actor: string,
  cmd: GameCommand,
  env: EngineEnv,
  tools: Tools,
): CommandResult | null {
  if (!actions.has(cmd.action)) return null
  const e = (w.expansion ??= blankExpansion())
  const r = expansionRules(env.rules)
  const now = env.now,
    at = new Date(now).toISOString(),
    player = w.players[actor]
  if (cmd.action !== 'moderateChat' && (!player || player.demo || player.suspended))
    fail('An active registered collector account is required.')
  switch (cmd.action) {
    case 'tick':
      return { message: 'Live auctions synchronized.' }
    case 'grade': {
      const card = tools.owned(String(cmd.card))
      if (card.attributes.grade != null || card.gradedAt)
        fail('Only ungraded cards can be graded, once.')
      const before = calculateValue(card.attributes, env.rules),
        fee = gradingFee(before.tv, env.rules)
      if (cmd.expectedFee !== fee || cmd.confirm !== true)
        fail('Review the grading fee and confirm that a low grade can reduce value.')
      tools.money(actor, -fee, `Card grading fee · ${card.id}`)
      card.attributes = { ...card.attributes, grade: Math.floor(env.random() * 10) + 1 }
      card.gradedAt = at
      const after = calculateValue(card.attributes, env.rules)
      assignSerials(w, card, after.perfect)
      const receipt = { id: env.uuid(), player: actor, card: card.id, at, fee, before, after }
      e.grades.push(receipt)
      card.provenance.push({
        at,
        action: `Graded ${card.attributes.grade}/10 · fee ${fee} · ${receipt.id}`,
        to: actor,
      })
      return {
        message: `Grade ${card.attributes.grade}/10 assigned. True Value is now ${after.tv.toLocaleString('en-US')}.`,
        cards: [card],
      }
    }
    case 'display': {
      if (e.displays[actor]) fail('Withdraw your currently displayed card before switching.')
      const card = tools.owned(String(cmd.card))
      const tv = calculateValue(card.attributes, env.rules).tv
      if (cmd.confirm !== true) fail('Confirm the display lock before continuing.')
      const payout = Math.floor(tv / r.displayDivisor)
      if (!payout)
        fail('This card needs a higher True Value to earn at least one credit per interval.')
      card.status = 'displayed'
      e.displays[actor] = {
        player: actor,
        card: card.id,
        startedAt: now,
        paidThrough: now,
        payout,
        intervalMs: r.displaySeconds * 1000,
        earned: 0,
        formulaVersion: env.rules.version,
      }
      return {
        message: 'Card displayed. Its payout and interval are locked for this display session.',
      }
    }
    case 'claimDisplay':
    case 'withdrawDisplay': {
      const display = e.displays[actor]
      if (!display) fail('There is no card on display.')
      const card = w.cards[display.card]
      if (card.owner !== actor || card.status !== 'displayed')
        fail('Display ownership check failed.')
      const intervals = Math.floor((now - display.paidThrough) / display.intervalMs)
      if (!intervals && cmd.action === 'claimDisplay')
        fail('The first full display interval is not complete yet.')
      const payout = intervals * display.payout
      if (!Number.isSafeInteger(payout))
        fail('Display payout exceeds the safe currency limit. Contact an operator.')
      if (payout)
        tools.money(actor, payout, `Card display · ${intervals} completed intervals · ${card.id}`)
      display.paidThrough += intervals * display.intervalMs
      display.earned += payout
      if (cmd.action === 'withdrawDisplay') {
        card.status = 'owned'
        delete e.displays[actor]
      }
      return {
        message: `${payout.toLocaleString('en-US')} display credits collected.${cmd.action === 'withdrawDisplay' ? ' Card returned; partial interval discarded.' : ''}`,
      }
    }
    case 'job': {
      const day = at.slice(0, 10)
      const job = e.jobs[actor] ?? { day, count: 0, lastAt: 0, earned: 0 }
      if (job.day !== day) {
        job.day = day
        job.count = 0
      }
      if (job.count >= r.jobDailyLimit)
        fail('All collection jobs are complete for today. Return after 00:00 UTC.')
      if (now - job.lastAt < r.jobCooldownSeconds * 1000)
        fail('The next sorting job is not ready yet.')
      if (cmd.task !== 'catalog' || cmd.confirm !== true)
        fail('Complete and confirm the collection-cataloguing task.')
      const reward = jobBaseReward(env.rules)
      tools.money(actor, reward, 'Collection job · catalogue verification')
      job.lastAt = now
      job.count++
      job.earned += reward
      e.jobs[actor] = job
      return { message: `Catalogue checked. ${reward} job credits earned.` }
    }
    case 'createAuction': {
      const card = tools.owned(String(cmd.card)),
        startingBid = amount(cmd.startingBid)
      const seconds = Number(cmd.seconds)
      if (
        !Number.isSafeInteger(seconds) ||
        seconds < r.auctionMinimumSeconds ||
        seconds > r.auctionMaximumSeconds
      )
        fail('Choose an allowed auction duration.')
      if (cmd.confirm !== true) fail('Confirm the auction lock and sale fee.')
      if (
        Object.values(e.auctions).filter((a) => a.seller === actor && a.status === 'active')
          .length >= 5
      )
        fail('You can have at most five active card auctions.')
      calculateValue(card.attributes, env.rules)
      const id = env.uuid()
      e.auctions[id] = {
        id,
        kind: 'card',
        title: card.name,
        seller: actor,
        card: card.id,
        createdAt: now,
        startsAt: now,
        endsAt: now + seconds * 1000,
        startingBid,
        incrementBps: r.bidIncrementBps,
        softCloseSeconds: r.softCloseSeconds,
        maximumExtensions: r.maximumExtensions,
        feeBps: Math.round(env.rules.fee * 10000),
        extensions: 0,
        status: 'active',
        bids: [],
      }
      card.status = 'auctioned'
      return {
        message:
          'Player-only card auction listed. The card is locked until cancellation or settlement.',
      }
    }
    case 'cancelAuction': {
      const a = e.auctions[String(cmd.auction)]
      if (!a || a.kind !== 'card' || a.seller !== actor || a.status !== 'active' || a.bids.length)
        fail('Only your own active auction with no bids can be canceled.')
      a.status = 'cancelled'
      w.cards[a.card!].status = 'owned'
      return { message: 'Auction canceled and card returned.' }
    }
    case 'bid': {
      const a = e.auctions[String(cmd.auction)]
      if (!a || cmd.confirm !== true) fail('Review and confirm an available auction.')
      if (a.kind === 'storage' && !a.seats?.some((s) => !s.npc && s.id === actor))
        fail('Join this storage room before bidding.')
      bid(w, a, actor, amount(cmd.amount), now, false, tools)
      return {
        message: 'Bid accepted. Credits are reserved; they return automatically if you are outbid.',
      }
    }
    case 'createStorage': {
      const tier = storageTiers.find(t => t.id === (cmd.tier ?? 'salvage'))
      if (!tier) fail('Choose a valid storage district.')
      const progress = advancement(w, actor, env.rules)
      if (progress.level < tier.level || progress.peakWorth < tier.worth)
        fail(`Unlock this district at level ${tier.level} and ${tier.worth} peak net worth.`)
      if (
        Object.values(e.auctions).some(
          (a) =>
            a.kind === 'storage' && a.status === 'active' && a.seats?.some((s) => s.id === actor),
        )
      )
        fail('You already have a seat in a live storage room.')
      if (
        Object.values(e.auctions).filter((a) => a.kind === 'storage' && a.status === 'active')
          .length >= 12
      )
        fail('Twelve rooms are already live. Join a lobby or wait for a room to finish.')
      const packs = env.packs.filter(
        (p) =>
          !p.limited && p.stock == null && !p.pool &&
          p.enabled &&
          r.storagePackSlugs.includes(p.slug) &&
          (!p.starts || Date.parse(p.starts) <= now) &&
          (!p.ends || Date.parse(p.ends) > now),
      )
      if (!packs.length) fail('No eligible standard packs are configured for storage units.')
      const id = env.uuid(),
        roll = (max: number) => Math.floor(env.random() * (max + 1))
      const chosenPack = () => structuredClone(packs[Math.floor(env.random() * packs.length)])
      const a: Auction = {
        id,
        kind: 'storage',
        title: `Storage unit ${tools.next('storage:rooms').toString().padStart(3, '0')}`,
        createdAt: now,
        startsAt: now + r.storageLobbySeconds * 1000,
        endsAt: now + (r.storageLobbySeconds + r.storageBiddingSeconds) * 1000,
        storageTier: tier.name,
        startingBid: r.storageStartingBid * tier.multiplier,
        incrementBps: r.bidIncrementBps,
        softCloseSeconds: r.softCloseSeconds,
        maximumExtensions: r.maximumExtensions,
        feeBps: 0,
        extensions: 0,
        status: 'active',
        bids: [],
        nextNpcAt: now + (r.storageLobbySeconds + 5) * 1000,
        seats: ['Mara', 'Sable', 'Flint', 'Orion'].map((name, i) => ({
          id: `npc:${id}:${i}`,
          name,
          npc: true,
          budget:
            r.storageNpcMinimumBudget + roll(r.storageNpcMaximumBudget - r.storageNpcMinimumBudget),
        })),
        prize: {
          cash: Math.max(r.storageStartingBid * 2, roll(r.storageMaximumCash)) * tier.multiplier,
          cards: Array.from({ length: roll(r.storageMaximumCards) }, () =>
            rollAttributes(chosenPack().odds, env.rules, env.random),
          ),
          packs: Array.from({ length: roll(r.storageMaximumPacks) }, chosenPack),
        },
      }
      a.title = `${tier.name} · ${a.title}`
      a.prize!.cardDesigns = a.prize!.cards.map(attributes =>
        structuredClone(drawCardDesign(attributes.rarity, env.designs, env.random)))
      a.prize!.cards = a.prize!.cards.map((attributes,i)=>
        designAttributes(attributes, a.prize!.cardDesigns![i], env.rules))
      a.npcBudgetCap = Math.floor(storageValue(a, env.rules) * 0.85)
      for (const seat of a.seats!) if (seat.npc)
        seat.budget = Math.min(seat.budget! * tier.multiplier, a.npcBudgetCap)
      a.seats![0] = { id: actor, name: player.name, npc: false }
      e.auctions[id] = a
      return {
        message: `${a.title} created. You replaced one of four NPC seats. Other players can join before bidding starts.`,
      }
    }
    case 'joinStorage': {
      const a = e.auctions[String(cmd.auction)]
      if (!a || a.kind !== 'storage' || a.status !== 'active' || now >= a.startsAt)
        fail('This storage lobby has already closed.')
      if (
        Object.values(e.auctions).some(
          (room) =>
            room.kind === 'storage' &&
            room.status === 'active' &&
            room.seats?.some((s) => s.id === actor),
        )
      )
        fail('You already occupy a live storage seat.')
      const index = a.seats!.findIndex((s) => s.npc)
      if (index < 0) fail('All four seats are occupied by players.')
      a.seats![index] = { id: actor, name: player.name, npc: false }
      return { message: 'You replaced an NPC. All four seats share the same server-timed auction.' }
    }
    case 'openRewardPack': {
      const reward = e.packs[String(cmd.reward)]
      if (!reward || reward.owner !== actor || reward.opened)
        fail('That reward pack is not available in your account.')
      if (reward.pack.limited) fail('Limited packs cannot be awarded through storage units.')
      assertPackAccess(w, actor, reward.pack, env.rules)
      const cards = mintPack(w, actor, reward.pack, env, `Storage reward · ${reward.pack.name}`)
      reward.opened = true
      const receipt = {
        id: env.uuid(),
        player: actor,
        pack: reward.pack.name,
        cards: cards.map((c) => c.id),
        cost: 0,
        at,
      }
      w.receipts.push(receipt)
      return { message: `${cards.length} reward cards committed.`, cards, receipt }
    }
    case 'chat': {
      if (typeof cmd.body !== 'string') fail('Write a message first.')
      const body = cmd.body.trim()
      if (!body || body.length > 280 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(body))
        fail('Messages must contain 1–280 printable characters.')
      if (now - (e.lastChat[actor] ?? 0) < r.chatCooldownSeconds * 1000)
        fail(`Please wait ${r.chatCooldownSeconds} seconds between messages.`)
      e.messages.push({ id: env.uuid(), player: actor, name: player.name, body, at: now })
      e.messages = e.messages.slice(-100)
      e.lastChat[actor] = now
      return { message: 'Message sent.' }
    }
    case 'reportChat': {
      const message = e.messages.find((m) => m.id === cmd.message)
      if (!message || message.player === actor)
        fail('Choose another collector’s message to report.')
      message.reports ??= []
      if (!message.reports.includes(actor)) message.reports.push(actor)
      if (message.reports.length >= 3) message.hidden = true
      return {
        message: 'Message reported. Three distinct reports hide a message pending operator review.',
      }
    }
    case 'moderateChat': {
      if (!env.operator || typeof cmd.reason !== 'string' || cmd.reason.trim().length < 5)
        fail('Operator authorization and an audit reason are required.')
      const message = e.messages.find((m) => m.id === cmd.message)
      if (!message) fail('Message not found.')
      message.hidden = true
      w.ledger.push({
        id: env.uuid(),
        player: actor,
        amount: 0,
        reason: `Chat moderation · ${message.id} · ${cmd.reason}`,
        at,
      })
      return { message: 'Message hidden; moderation recorded in the immutable event history.' }
    }
  }
  return null
}

export function expansionView(w: World, actor: string, rules: Rules): ExpansionView {
  const e = w.expansion ?? blankExpansion()
  const cardView = (card: Card): Card => ({
    ...card,
    openingSnapshot: card.snapshot,
    snapshot: calculateValue(card.attributes, rules),
  })
  const auctions: AuctionView[] = Object.values(e.auctions)
    .filter(
      (a) =>
        a.status === 'active' ||
        a.seller === actor ||
        a.seats?.some((s) => s.id === actor) ||
        a.bids.some((b) => b.bidder === actor),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 80)
    .map((a) => {
      const { prize, seats, nextNpcAt: _privateClock, ...publicFields } = a
      const high = a.bids.at(-1)
      return {
        ...publicFields,
        bids: a.bids.slice(-20),
        sellerName: a.seller ? w.players[a.seller]?.name : undefined,
        cardData: a.card ? cardView(w.cards[a.card]) : undefined,
        minimumBid: minimumBid(a),
        seats: seats?.map(({ budget: _privateBudget, ...seat }) => seat),
        highestBidderName: high
          ? high.npc
            ? seats?.find((s) => s.id === high.bidder)?.name
            : w.players[high.bidder]?.name
          : undefined,
        prize: a.status === 'sold' && high?.bidder === actor ? prize : undefined,
      }
    })
  return {
    auctions,
    grades: e.grades
      .filter((g) => g.player === actor)
      .slice(-30)
      .reverse(),
    jobs: e.jobs[actor],
    displays: Object.values(e.displays).map((d) => ({
      ...d,
      name: w.players[d.player]?.name || 'Collector',
      cardData: cardView(w.cards[d.card]),
    })),
    packs: Object.values(e.packs).filter((p) => p.owner === actor),
    messages: e.messages.map(({ reports: _privateReports, ...message }) => ({
      ...message,
      body: message.hidden ? '[Message hidden by moderation]' : message.body,
    })),
  }
}
