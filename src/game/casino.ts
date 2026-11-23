import type { EngineEnv } from './engine'
import type { Card, CommandResult, GameCommand, Pack, World } from './types'
import { assertPackAccess } from './advancement'
import { mintPack } from './mint'
import type { Rules } from './rules'

export type Battle = {
  id: string; host: string; players: string[]; seats: number
  mode: 'highest' | 'lowest' | 'shared' | 'final-round'
  packs: Pack[]; cost: number; createdAt: number; expiresAt: number
  status: 'waiting' | 'complete' | 'cancelled'
  catalogRevision?: string
  rules: Rules; designs: EngineEnv['designs']
  scores?: { player: string; total: number; rounds: number[]; cards: string[] }[]
  winners?: string[]
}
export type BlackjackHand = {
  id: string; bet: number; player: string[]; dealer: string[]; deck: string[]
  status: 'playing' | 'won' | 'lost' | 'push' | 'blackjack'; payout: number
}
export type CasinoState = { battles: Record<string, Battle>; hands: Record<string, BlackjackHand> }
export type CasinoView = {
  battles: Omit<Battle, 'rules' | 'designs'>[]
  hand?: Omit<BlackjackHand, 'deck'>; spent: number; plays: number
}
type Tools = { money: (actor: string, amount: number, reason: string) => void }
const actions = new Set(['createBattle', 'joinBattle', 'cancelBattle', 'plinko', 'blackjack', 'blackjackHit', 'blackjackStand'])
const dayKey = (actor: string, now: number) => `${actor}:${new Date(now).toISOString().slice(0, 10)}`
export function casinoSpend(w: World, actor: string, amount: number, now: number, legacySlotCost = 10) {
  const key = `casino-spend:${dayKey(actor, now)}`
  const oldSlots = w.players[actor].spinDay === new Date(now).toISOString().slice(0, 10) ? w.players[actor].spins ?? 0 : 0
  const spent = w.counters[key] ?? oldSlots * legacySlotCost
  if (spent + amount > (w.players[actor].spendLimit ?? 1500))
    throw new Error('Your daily casino spending control has been reached. Review it in Settings.')
  w.counters[key] = spent + amount
}
export function handValue(cards: string[]) {
  let aces = 0
  let total = cards.reduce((n, c) => {
    const rank = c.slice(0, -1)
    if (rank === 'A') { aces++; return n + 11 }
    return n + (['J', 'Q', 'K'].includes(rank) ? 10 : Number(rank))
  }, 0)
  while (total > 21 && aces-- > 0) total -= 10
  return total
}
export const plinkoMultipliers = [10, 3, 1.5, 0.5, 0.4, 0.5, 1.5, 3, 10]
export function expireBattles(w: World, now: number, tools: Tools) {
  for (const battle of Object.values(w.casino?.battles ?? {}))
    if (battle.status === 'waiting' && now >= battle.expiresAt) {
      for (const id of battle.players) tools.money(id, battle.cost, `Expired pack battle refund · ${battle.id}`)
      battle.status = 'cancelled'
    }
}
export function applyCasino(w: World, actor: string, cmd: GameCommand, env: EngineEnv, tools: Tools): CommandResult | null {
  if (!actions.has(cmd.action)) return null
  const player = w.players[actor]
  if (!player || player.demo || player.suspended) throw new Error('Sign in to an active player account.')
  const casino = w.casino ??= { battles: {}, hands: {} }
  if (cmd.action === 'createBattle') {
    if (!Array.isArray(cmd.packs) || !cmd.packs.length || cmd.packs.length > 10 ||
        cmd.packs.some(p => typeof p !== 'string') ||
        ![2, 3, 4].includes(Number(cmd.seats)) ||
        !['highest', 'lowest', 'shared', 'final-round'].includes(String(cmd.mode)))
      throw new Error('Select 1–10 pack rounds, 2–4 players, and a battle mode.')
    if (Object.values(casino.battles).filter(b => b.status === 'waiting').length >= 20 ||
        Object.values(casino.battles).some(b => b.status === 'waiting' && b.players.includes(actor)))
      throw new Error('Finish or cancel your current battle; at most 20 lobbies may wait at once.')
    const packs = cmd.packs.map(id => {
      const p = env.packs.find(p => String(p.id) === id)
      if (!p?.enabled || p.limited || p.stock != null || p.perPlayerLimit != null ||
          p.perPlayerDailyLimit != null || p.maxDistinctPlayers != null || p.cooldownSeconds ||
          (p.starts && Date.parse(p.starts) > env.now) || (p.ends && Date.parse(p.ends) <= env.now))
        throw new Error('Battles require available, unlimited standard packs. Limited releases stay in the shop.')
      assertPackAccess(w, actor, p, env.rules)
      return structuredClone(p)
    })
    const cost = packs.reduce((sum, p) => sum + p.price, 0)
    if (cmd.expectedPrice !== cost) throw new Error('Review the current entry price before creating a lobby.')
    casinoSpend(w, actor, cost, env.now, env.rules.slots.cost)
    tools.money(actor, -cost, 'Pack battle entry escrow')
    const id = env.uuid()
    casino.battles[id] = { id, host: actor, players: [actor], seats: Number(cmd.seats),
      mode: cmd.mode as Battle['mode'], packs, cost, createdAt: env.now, expiresAt: env.now + 600000,
      status: 'waiting', catalogRevision: String(cmd.expectedCatalog ?? ''), rules: structuredClone(env.rules),
      designs: structuredClone(env.designs) }
    return { message: 'Battle lobby created. Entry reserved; automatic refund if unfilled after ten minutes.' }
  }
  if (cmd.action === 'cancelBattle' || cmd.action === 'joinBattle') {
    const b = casino.battles[String(cmd.battle)]
    if (!b || b.status !== 'waiting' || b.expiresAt <= env.now) throw new Error('This battle is no longer joinable.')
    if (cmd.action === 'cancelBattle') {
      if (b.host !== actor) throw new Error('Only the host can cancel this waiting lobby.')
      for (const id of b.players) tools.money(id, b.cost, `Pack battle cancellation refund · ${b.id}`)
      b.status = 'cancelled'
      return { message: 'Lobby canceled. Every entry refunded in full.' }
    }
    if (b.players.includes(actor) || b.players.length >= b.seats ||
        Object.values(casino.battles).some(other => other.status === 'waiting' && other.players.includes(actor)))
      throw new Error('You already have a battle seat, or this lobby is full.')
    if (cmd.expectedPrice !== b.cost) throw new Error('Review this lobby’s entry price again.')
    // Participants accept the same immutable catalog as the host, not edited packs.
    for (const p of b.packs) assertPackAccess(w, actor, p, b.rules)
    casinoSpend(w, actor, b.cost, env.now, env.rules.slots.cost)
    tools.money(actor, -b.cost, `Pack battle entry escrow · ${b.id}`)
    b.players.push(actor)
    if (b.players.length < b.seats) return { message: 'Seat reserved. Waiting for the remaining collectors.' }
    const battleEnv = { ...env, rules: b.rules, designs: b.designs }
    const cards: Card[] = []
    b.scores = b.players.map(id => {
      const own: Card[] = [], rounds: number[] = []
      for (const pack of b.packs) {
        const drawn = mintPack(w, id, pack, battleEnv, `Pack battle · ${b.id} · ${pack.name}`)
        own.push(...drawn); rounds.push(drawn.reduce((sum, c) => sum + c.snapshot.tv, 0))
      }
      cards.push(...own)
      return { player: id, total: rounds.reduce((a, b) => a + b, 0), rounds, cards: own.map(c => c.id) }
    })
    if (b.mode === 'shared') b.winners = [...b.players]
    else {
      const score = (s: NonNullable<Battle['scores']>[number]) => b.mode === 'final-round' ? s.rounds.at(-1)! : s.total
      const best = (b.mode === 'lowest' ? Math.min : Math.max)(...b.scores.map(score))
      b.winners = b.scores.filter(s => score(s) === best).map(s => s.player)
      // Ties share the pool. Rotate allocation with server randomness, not seat advantage.
      const offset = Math.floor(env.random() * b.winners.length)
      cards.forEach((card, i) => {
        const winner = b.winners![(i + offset) % b.winners!.length]
        card.provenance.push({ at: new Date(env.now).toISOString(), action: `Battle ${b.mode} settlement`, from: card.owner, to: winner })
        card.owner = winner
      })
    }
    b.status = 'complete'
    return { message: 'Battle settled atomically. All results and awarded cards are saved.' }
  }
  if (cmd.action === 'blackjackHit' || cmd.action === 'blackjackStand') {
    const hand = casino.hands[actor]
    if (!hand || hand.status !== 'playing') throw new Error('Start a blackjack hand first.')
    if (cmd.hand !== hand.id) throw new Error('This hand changed. Review your current hand.')
    if (cmd.action === 'blackjackHit') hand.player.push(hand.deck.pop()!)
    const value = handValue(hand.player)
    if (value > 21) hand.status = 'lost'
    else if (cmd.action === 'blackjackStand' || value === 21) {
      while (handValue(hand.dealer) < 17) hand.dealer.push(hand.deck.pop()!)
      const dealer = handValue(hand.dealer)
      hand.status = dealer > 21 || value > dealer ? 'won' : value === dealer ? 'push' : 'lost'
    }
    if (hand.status !== 'playing') {
      hand.payout = hand.status === 'won' ? hand.bet * 2 : hand.status === 'push' ? hand.bet : 0
      if (hand.payout) tools.money(actor, hand.payout, `Blackjack ${hand.status} · ${hand.id}`)
    }
    return { message: hand.status === 'playing' ? 'Card drawn. Hit or stand.' : `Blackjack ${hand.status} · ${hand.payout} credits returned.` }
  }
  if (!Number.isSafeInteger(cmd.bet) || Number(cmd.bet) < 10 || Number(cmd.bet) > 1000)
    throw new Error('Choose a whole-credit bet from 10 to 1,000.')
  const bet = Number(cmd.bet)
  const key = `casino-plays:${dayKey(actor, env.now)}`
  if ((w.counters[key] ?? 0) >= 100) throw new Error('Daily casino play limit reached. Return after 00:00 UTC.')
  if (cmd.action === 'blackjack' && casino.hands[actor]?.status === 'playing')
    throw new Error('Finish your current blackjack hand before dealing again.')
  casinoSpend(w, actor, bet, env.now, env.rules.slots.cost)
  tools.money(actor, -bet, `${cmd.action} wager`)
  w.counters[key] = (w.counters[key] ?? 0) + 1
  if (cmd.action === 'plinko') {
    const path = Array.from({ length: 8 }, () => env.random() < 0.5 ? 0 : 1)
    const bin = path.reduce<number>((a, b) => a + b, 0)
    const payout = Math.floor(bet * plinkoMultipliers[bin])
    tools.money(actor, payout, `Plinko bin ${bin} · ${plinkoMultipliers[bin]}×`)
    return { message: `Plinko: ${path.map(n => n ? 'R' : 'L').join(' · ')} → ${plinkoMultipliers[bin]}× · ${payout} credits returned.` }
  }
  const deck = ['H', 'D', 'C', 'S'].flatMap(suit => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(rank => rank + suit))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(env.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const hand: BlackjackHand = { id: env.uuid(), bet, player: [deck.pop()!, deck.pop()!],
    dealer: [deck.pop()!, deck.pop()!], deck, status: 'playing', payout: 0 }
  const natural = handValue(hand.player) === 21, dealerNatural = handValue(hand.dealer) === 21
  if (natural || dealerNatural) {
    hand.status = natural && dealerNatural ? 'push' : natural ? 'blackjack' : 'lost'
    hand.payout = hand.status === 'push' ? bet : natural ? Math.floor(bet * 2.5) : 0
    if (hand.payout) tools.money(actor, hand.payout, `Blackjack ${hand.status} · ${hand.id}`)
  }
  casino.hands[actor] = hand
  return { message: hand.status === 'playing' ? 'Hand dealt. Hit or stand; your hand is saved across sessions.' : `Blackjack ${hand.status} · ${hand.payout} credits returned.` }
}
export function casinoView(w: World, actor: string, now: number): CasinoView {
  const hand = w.casino?.hands[actor]
  return {
    spent: w.counters[`casino-spend:${dayKey(actor, now)}`] ?? 0,
    plays: w.counters[`casino-plays:${dayKey(actor, now)}`] ?? 0,
    hand: hand ? { id: hand.id, bet: hand.bet, player: hand.player,
      dealer: hand.status === 'playing' ? [hand.dealer[0], '?'] : hand.dealer,
      status: hand.status, payout: hand.payout } : undefined,
    battles: Object.values(w.casino?.battles ?? {})
      .filter(b => b.status === 'waiting' || b.players.includes(actor)).slice(-50)
      .map(({ rules: _rules, designs: _designs, ...b }) => b),
  }
}
