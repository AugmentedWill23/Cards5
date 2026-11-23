import { calculateValue, rollAttributes, weightedIndex } from './rules'
import type { Rules } from './rules'
import type {
  Card,
  CardDesign,
  CommandResult,
  GameCommand,
  Pack,
  Player,
  Trade,
  World,
} from './types'
import { designAttributes, drawPackCard } from './designs'
import { applyExpansion, tickExpansion } from './expansion'
import { dailyQuests, questKey, recordProgress } from './progression'
import { upgradeMarker, upgradePreview } from './economy-update'
import { advancement, assertPackAccess, dailyBaseReward, slotConfiguration } from './advancement'
import { applyCasino, casinoSpend, expireBattles } from './casino'
import { mintPack } from './mint'
import { assignSerials } from './identity'
import { duplicateSaleQuote } from './quick-sale'
import { maxQuickSellCards } from './types'

export type EngineEnv = {
  now: number
  random: () => number
  uuid: () => string
  rules: Rules
  packs: Pack[]
  designs: CardDesign[]
  operator?: boolean
}
function fail(message: string): never {
  throw new Error(message)
}
function coins(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1e12)
    fail('Enter a valid whole-credit amount')
  return value as number
}
function ids(value: unknown, max = 30) {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((v) => typeof v !== 'string' || !v.length || v.length > 160) ||
    new Set(value).size !== value.length
  )
    fail('Invalid card selection')
  return value as string[]
}
export function applyCommand(
  original: World,
  actor: string,
  command: GameCommand,
  env: EngineEnv,
): { state: World; result: CommandResult } {
  const prior = original.requests[command.key]
  if (prior) {
    if (prior.player !== actor) fail('That request belongs to another player')
    return { state: original, result: prior.result }
  }
  const w = structuredClone(original)
  const at = new Date(env.now).toISOString(),
    day = at.slice(0, 10)
  const player = w.players[actor]
  if (player) w.counters[`peak-worth:${actor}`] = advancement(w, actor, env.rules).peakWorth
  const owned = (id: string) => {
    const card = w.cards[id]
    if (!card || card.owner !== actor || card.status !== 'owned')
      fail('This card is not available in your inventory')
    return card
  }
  const money = (id: string, amount: number, reason: string) => {
    const p = w.players[id]
    if (!p || !Number.isSafeInteger(p.balance + amount) || p.balance + amount < 0)
      fail('Not enough available credits')
    p.balance += amount
    w.ledger.push({ id: env.uuid(), player: id, amount, reason, at })
  }
  const next = (scope: string) => (w.counters[scope] = (w.counters[scope] || 0) + 1)
  const tools = { money, owned, next }
  if (command.action === 'economyUpgrade') {
    if (!env.operator || command.confirmation !== 'CONFIRM' ||
        typeof command.reason !== 'string' || command.reason.trim().length < 5)
      fail('An economy operator, CONFIRM and an audit reason are required.')
    const preview = upgradePreview(w)
    if (preview.applied) return { state: original, result: { message: 'The economy upgrade was already applied.' } }
    for (const grant of preview.grants) if (grant.grant > 0) {
      money(grant.id, grant.grant, `Economy 2.2 · verified starter top-up + 250 bonus · ${command.reason}`)
      w.counters[`${upgradeMarker}:${grant.id}`] = 1
    }
    w.counters[upgradeMarker] = 1
    const result = { message: `Upgrade committed: ${preview.eligible} collectors credited ${preview.total.toLocaleString()} credits. ${preview.reviewRequired} records require manual review.` }
    w.requests[command.key] = { player: actor, result }
    return { state: w, result }
  }
  const release = (t: Trade) => {
    for (const id of [...t.fromCards, ...(t.toReserved ? t.toCards : [])])
      if (w.cards[id]?.status === 'locked') w.cards[id].status = 'owned'
    money(t.from, t.fromCoins, 'Trade reserve released')
    if (t.toReserved) money(t.to, t.toCoins, 'Trade reserve released')
  }
  for (const t of Object.values(w.trades))
    if (t.status === 'pending' && Date.parse(t.expires) <= env.now) {
      release(t)
      t.status = 'expired'
    }
  tickExpansion(w, env, tools)
  expireBattles(w, env.now, tools)
  const extension = applyCasino(w, actor, command, env, tools) ?? applyExpansion(w, actor, command, env, tools)
  if (extension) {
    recordProgress(w, actor, command, day, env.rules)
    w.requests[command.key] = { player: actor, result: extension }
    return { state: w, result: extension }
  }
  let result: CommandResult = { message: 'Saved successfully' }
  if (command.action === 'admin') {
    if (!env.operator) fail('Operator permission is required')
    if (
      command.confirmation !== 'CONFIRM' ||
      typeof command.reason !== 'string' ||
      command.reason.trim().length < 5
    )
      fail('Type CONFIRM and provide a reason of at least five characters')
    const target = w.players[String(command.target)]
    if (!target) fail('Player was not found')
    const before = structuredClone(target)
    if (command.operation === 'grantCurrency')
      money(target.id, coins(command.amount), `Operator grant · ${command.reason}`)
    else if (command.operation === 'removeCurrency')
      money(target.id, -coins(command.amount), `Operator adjustment · ${command.reason}`)
    else if (command.operation === 'suspend' || command.operation === 'restore')
      target.suspended = command.operation === 'suspend'
    else if (command.operation === 'grantCard') {
      const design = env.designs.find((d) => String(d.id) === command.design)
      if (command.design && (!design?.enabled || design.availability === 'limited-only'))
        fail('Choose an enabled, non-Limited design for a support grant.')
      if (design && command.designRevision != null && command.designRevision !== design.revision)
        fail('The selected design changed. Reload it and review the grant preview.')
      let attributes = command.attributes as Card['attributes']
      if ((!attributes && !design) || attributes?.limited)
        fail(
          'Support grants must use standard card attributes. Limited releases require an explicitly published crate.',
        )
      if (design) attributes = designAttributes({ ...attributes, quality: attributes?.quality ?? 'Normal', rarity: design.rarity }, design, env.rules)
      const quantity = command.quantity == null ? 1 : coins(command.quantity)
      if (quantity < 1 || quantity > 50) fail('Grant between 1 and 50 cards at a time.')
      result.cards = []
      for (let i = 0; i < quantity; i++) {
      const snapshot = calculateValue(attributes, env.rules)
      const card: Card = {
        id: env.uuid(),
        name: design?.name ?? 'Operator’s Impression',
        ...(design ? { designId: design.id, designSlug: design.slug, visual: design.visual } : {}),
        owner: target.id,
        attributes: structuredClone(attributes),
        snapshot,
        createdAt: at,
        source: 'Authorized support grant',
        status: 'owned',
        provenance: [{ at, action: `Operator grant · ${command.reason}`, to: target.id }],
      }
      assignSerials(w, card)
      w.cards[card.id] = card
      result.cards.push(card)
      }
    } else if (command.operation === 'removeCard') {
      const card = w.cards[String(command.card)]
      if (!card || card.owner !== target.id || card.status !== 'owned')
        fail('The target must own an available card before it can be removed')
      card.status = 'burned'
      card.provenance.push({
        at,
        action: `Authorized operator removal · ${command.reason}`,
        from: target.id,
      })
      result.cards = [card]
    } else fail('Unknown operator action')
    result.message = `Operator ${command.operation} committed · ${command.reason}`
    result.audit = {
      actor,
      target: target.id,
      reason: command.reason,
      operation: String(command.operation),
      at,
      before,
      after: structuredClone(target),
    }
  } else if (command.action === 'join') {
    if (player) return { state: original, result: { message: 'Welcome back' } }
    const name = String(command.name || 'Collector')
      .trim()
      .slice(0, 24)
    w.players[actor] = {
      id: actor,
      name: name || 'Collector',
      balance: 0,
      joined: at,
      demo: command.demo === true,
      spendLimit: 1500,
      notifications: true,
    }
    const starter = env.rules.rewards?.starter ?? 500
    money(actor, starter, 'Welcome grant · play credits only')
    result.message = `Your vault is ready. ${starter.toLocaleString('en-US')} starter credits added.`
  } else {
    if (!player || player.suspended) fail('Sign in to an active account to continue')
    switch (command.action) {
      case 'expire': {
        result.message = 'Expired offers released'
        break
      }
      case 'daily': {
        if (player.lastDaily === day)
          fail('Daily reward already claimed. Come back after 00:00 UTC.')
        const yesterday = new Date(env.now - 86400000).toISOString().slice(0, 10)
        const enhanced = (env.rules.rewards?.starter ?? 0) >= 1250
        player.dailyStreak = player.lastDaily === yesterday ? (player.dailyStreak ?? 0) + 1 : 1
        player.lastDaily = day
        const daily = dailyBaseReward(env.rules)
        const streakBonus = enhanced ? Math.min(6, player.dailyStreak - 1) * 25 : 0
        money(actor, daily + streakBonus, 'Daily reward')
        result.message = `${(daily + streakBonus).toLocaleString('en-US')} daily credits added · ${player.dailyStreak}-day streak${streakBonus ? ` · ${streakBonus} streak bonus` : ''}`
        break
      }
      case 'claimQuest': {
        if ((env.rules.rewards?.starter ?? 0) < 1250) fail('An operator must activate the enhanced economy first.')
        const quest = dailyQuests.find((q) => q.id === command.quest)
        if (!quest) fail('Choose a daily objective.')
        const key = questKey(actor, day, quest.id)
        if ((w.counters[key] ?? 0) < quest.target) fail('Complete this objective before claiming it.')
        if (w.counters[`${key}:claimed`]) fail('This objective reward was already claimed today.')
        money(actor, quest.reward, `Daily objective · ${quest.title}`)
        w.counters[`${key}:claimed`] = 1
        result.message = `${quest.reward} objective credits collected.`
        break
      }
      case 'open': {
        const pack = env.packs.find((p) => String(p.id) === command.pack)
        const count = coins(command.count)
        if (!pack?.enabled || count < 1 || count > 10)
          fail('Choose an available pack and 1–10 openings')
        assertPackAccess(w, actor, pack, env.rules)
        if (
          (pack.starts && Date.parse(pack.starts) > env.now) ||
          (pack.ends && Date.parse(pack.ends) <= env.now)
        )
          fail('This release is outside its opening window')
        const used = w.counters[`stock:${pack.id}`] || 0
        if (command.expectedPrice != null && command.expectedPrice !== pack.price * count)
          fail('The pack price changed. Please review the new total before opening.')
        if (pack.stock != null && used + count > pack.stock) fail('This release has sold out')
        if (pack.limited && pack.edition != null &&
            (w.counters[`limited:${pack.serialScope ?? pack.slug}`] ?? used * pack.count) + count * pack.count > pack.edition)
          fail('This opening would exceed the remaining Limited card edition.')
        const usageKey = `case:${pack.id}:player:${actor}`
        const playerUsed = w.counters[usageKey] || 0
        const dailyKey = `${usageKey}:day:${day}`
        const distinctKey = `case:${pack.id}:distinct`
        const lastKey = `${usageKey}:last`
        if (pack.perPlayerLimit != null && playerUsed + count > pack.perPlayerLimit)
          fail('This opening exceeds your lifetime limit for this case')
        if (
          pack.perPlayerDailyLimit != null &&
          (w.counters[dailyKey] || 0) + count > pack.perPlayerDailyLimit
        )
          fail('This opening exceeds your UTC daily limit for this case')
        if (
          !playerUsed &&
          pack.maxDistinctPlayers != null &&
          (w.counters[distinctKey] || 0) >= pack.maxDistinctPlayers
        )
          fail('This case has reached its distinct-collector limit')
        if (
          pack.cooldownSeconds &&
          w.counters[lastKey] != null &&
          env.now - w.counters[lastKey] < pack.cooldownSeconds * 1000
        )
          fail('Your cooldown for this case has not finished')
        money(actor, -pack.price * count, `Opened ${count} × ${pack.name}`)
        const cards: Card[] = []
        for (let n = 0; n < count; n++) cards.push(...mintPack(w, actor, pack, env))
        w.counters[`stock:${pack.id}`] = used + count
        w.counters[usageKey] = playerUsed + count
        w.counters[dailyKey] = (w.counters[dailyKey] || 0) + count
        w.counters[lastKey] = env.now
        if (!playerUsed) w.counters[distinctKey] = (w.counters[distinctKey] || 0) + 1
        const receipt = {
          id: env.uuid(),
          player: actor,
          pack: pack.name,
          cards: cards.map((c) => c.id),
          cost: pack.price * count,
          at,
        }
        w.receipts.push(receipt)
        result = { message: `${cards.length} cards added to your collection`, cards, receipt }
        break
      }
      case 'quickSell':
      case 'quickSellDuplicates': {
        const duplicates = command.action === 'quickSellDuplicates'
        const quote = duplicates
          ? duplicateSaleQuote(Object.values(w.cards), actor, c => calculateValue(c.attributes, env.rules))
          : null
        if (quote && command.quote !== quote.token)
          fail('The duplicates or their sale values changed. Close this review and check the refreshed collection.')
        const selected = (quote?.ids ?? ids(command.cards, maxQuickSellCards)).map(owned)
        if (!selected.length) fail(duplicates ? 'No eligible duplicates to sell.' : 'Select at least one card.')
        const total = quote?.credits ?? selected.reduce((sum, c) => sum + calculateValue(c.attributes, env.rules).qsv, 0)
        if (command.expectedQsv != null && command.expectedQsv !== total)
          fail('The current Quick Sell value changed. Close this review and check the refreshed collection.')
        money(actor, total, `${duplicates ? 'Duplicate quick sale' : 'Quick sale'} · ${selected.length} cards permanently removed`)
        for (const card of selected) {
          card.status = 'burned'
          card.provenance.push({ at, action: 'Permanently quick-sold', from: actor })
        }
        result.message = `Quick-sold for ${total.toLocaleString()} credits. Cards permanently removed.`
        break
      }
      case 'list': {
        const card = owned(String(command.card)),
          price = coins(command.price)
        if (price < 1) fail('The asking price must be at least 1 credit')
        calculateValue(card.attributes, env.rules)
        const id = env.uuid()
        card.status = 'listed'
        w.listings[id] = {
          id,
          card: card.id,
          seller: actor,
          price,
          status: 'active',
          createdAt: at,
        }
        result.message = 'Listed on the player market. A sale is not guaranteed.'
        break
      }
      case 'cancelListing':
      case 'editListing': {
        const listing = w.listings[String(command.listing)]
        if (!listing || listing.seller !== actor || listing.status !== 'active')
          fail('This listing is no longer available')
        if (command.action === 'editListing') {
          const price = coins(command.price)
          if (!price) fail('Price must be positive')
          listing.price = price
        } else {
          listing.status = 'cancelled'
          w.cards[listing.card].status = 'owned'
        }
        result.message =
          command.action === 'editListing'
            ? 'Asking price updated'
            : 'Listing cancelled; card returned to inventory'
        break
      }
      case 'buy': {
        const listing = w.listings[String(command.listing)]
        if (!listing || listing.status !== 'active')
          fail('Another collector already bought this listing')
        if (listing.seller === actor) fail('You cannot buy your own listing')
        if (listing.price !== command.price) fail('The asking price changed. Review it again.')
        const card = w.cards[listing.card]
        if (card.owner !== listing.seller || card.status !== 'listed')
          fail('The seller no longer owns this card')
        calculateValue(card.attributes, env.rules)
        money(actor, -listing.price, `Market purchase · ${card.name}`)
        money(
          listing.seller,
          listing.price - Math.floor(listing.price * env.rules.fee),
          `Market sale · ${card.name} · ${env.rules.fee * 100}% fee`,
        )
        w.ledger.push({
          id: env.uuid(),
          player: 'system:market-fees',
          amount: Math.floor(listing.price * env.rules.fee),
          reason: `Market fee · ${listing.id}`,
          at,
        })
        card.provenance.push({ at, action: 'Market transfer', from: card.owner, to: actor })
        card.owner = actor
        card.status = 'owned'
        listing.status = 'sold'
        listing.buyer = actor
        w.sales.push({
          attributes: card.attributes,
          amount: listing.price,
          at,
          seller: listing.seller,
          buyer: actor,
          card: card.id,
          demo: w.players[listing.seller].demo,
        })
        result.message = `${card.name} is now in your collection`
        break
      }
      case 'spin': {
        const s = slotConfiguration(env.rules, command.tier ?? 'copper')
        const progress = advancement(w, actor, env.rules)
        if (progress.level < s.tier.level || progress.peakWorth < s.tier.worth)
          fail(`Unlock ${s.tier.name} slots at level ${s.tier.level} and ${s.tier.worth} peak net worth.`)
        if (!s.enabled) fail('Slots are currently paused')
        if (env.now - (player.lastSpin || 0) < s.cooldown * 1000)
          fail(`Please wait ${s.cooldown} seconds between spins`)
        if (player.spinDay !== day) {
          player.spins = 0
          player.spinDay = day
        }
        if ((player.spins || 0) >= s.dailyLimit) fail('Daily play limit reached. Return tomorrow.')
        casinoSpend(w, actor, s.cost, env.now, env.rules.slots.cost)
        money(actor, -s.cost, 'Slot play')
        const outcome =
          s.rewards[
            weightedIndex(
              s.rewards.map((r) => r.weight),
              env.random,
            )
          ]
        money(actor, outcome.amount, 'Slot reward')
        player.lastSpin = env.now
        player.spins = (player.spins || 0) + 1
        result = {
          message: outcome.amount
            ? `Reward: ${outcome.amount} credits`
            : 'No reward this spin. Take your time.',
          spin: { amount: outcome.amount, symbols: outcome.symbols },
        }
        break
      }
      case 'settings': {
        const name = String(command.name || '').trim()
        if (name.length < 2 || name.length > 24) fail('Display names must be 2–24 characters')
        player.name = name
        player.hidden = command.hidden === true
        player.notifications = command.notifications === true
        player.privateCollection = command.privateCollection === true
        player.spendLimit = coins(command.spendLimit)
        result.message = 'Profile and play controls saved'
        break
      }
      case 'trade':
      case 'editTrade': {
        const fromCards = ids(command.fromCards),
          toCards = ids(command.toCards)
        const fromCoins = coins(command.fromCoins),
          toCoins = coins(command.toCoins)
        const to = String(command.to)
        if (
          !w.players[to] ||
          to === actor ||
          w.players[to].suspended ||
          w.players[to].demo ||
          player.demo
        )
          fail('Choose another active collector')
        let revision = 1
        const old = command.action === 'editTrade' ? w.trades[String(command.trade)] : null
        if (command.action === 'editTrade') {
          if (!old || old.from !== actor || old.status !== 'pending')
            fail('This offer cannot be edited')
          release(old)
          revision = old.revision + 1
        }
        if (!fromCards.length && !toCards.length && !fromCoins && !toCoins)
          fail('Add cards or credits to the trade')
        for (const id of fromCards) owned(id)
        for (const id of toCards)
          if (w.cards[id]?.owner !== to || w.cards[id]?.status !== 'owned')
            fail('A requested card is unavailable')
        money(actor, -fromCoins, 'Trade credits reserved')
        for (const id of fromCards) {
          calculateValue(w.cards[id].attributes, env.rules)
          w.cards[id].status = 'locked'
        }
        const id = old?.id || env.uuid()
        w.trades[id] = {
          id,
          from: actor,
          to,
          fromCards,
          toCards,
          fromCoins,
          toCoins,
          toReserved: false,
          revision,
          accepted: [],
          status: 'pending',
          createdAt: at,
          expires: new Date(env.now + 86400000).toISOString(),
        }
        result = {
          message:
            'Offer saved. Your assets are reserved; the other side reserves theirs when they confirm.',
          trade: id,
        }
        break
      }
      case 'acceptTrade':
      case 'cancelTrade':
      case 'declineTrade': {
        const t = w.trades[String(command.trade)]
        if (!t || ![t.from, t.to].includes(actor) || t.status !== 'pending')
          fail('This trade is no longer pending')
        if (t.revision !== command.revision) fail('This offer was edited. Review the new revision.')
        if (command.action === 'cancelTrade' || command.action === 'declineTrade') {
          release(t)
          t.status = command.action === 'cancelTrade' ? 'cancelled' : 'declined'
          result.message = 'Offer closed and reserved assets released'
          break
        }
        if (w.players[t.from].demo || w.players[t.to].demo)
          fail('Historical demo offers can only be canceled. Trade with a registered collector.')
        const confirmer = actor
        if (confirmer === t.to && !t.toReserved) {
          for (const id of t.toCards)
            if (w.cards[id]?.owner !== t.to || w.cards[id]?.status !== 'owned')
              fail('A requested card is no longer available. Ask for an updated offer.')
          money(t.to, -t.toCoins, 'Confirmed trade credits reserved')
          for (const id of t.toCards) w.cards[id].status = 'locked'
          t.toReserved = true
        }
        if (!t.accepted.includes(confirmer)) t.accepted.push(confirmer)
        if (t.accepted.includes(t.from) && t.accepted.includes(t.to)) {
          for (const [cards, from, to] of [
            [t.fromCards, t.from, t.to],
            [t.toCards, t.to, t.from],
          ] as [string[], string, string][])
            for (const id of cards) {
              const card = w.cards[id]
              if (card.owner !== from || card.status !== 'locked')
                fail('Reserved card ownership changed')
              calculateValue(card.attributes, env.rules)
              card.owner = to
              card.status = 'owned'
              card.provenance.push({ at, action: `Trade revision ${t.revision}`, from, to })
            }
          money(t.to, t.fromCoins, 'Completed trade')
          money(t.from, t.toCoins, 'Completed trade')
          t.status = 'completed'
          result.message = 'Trade completed. Both sides confirmed the exact offer.'
        } else result.message = 'Your confirmation is saved. Waiting for the other collector.'
        break
      }
      default:
        fail('Unknown game action')
    }
  }
  recordProgress(w, actor, command, day, env.rules)
  w.requests[command.key] = { player: actor, result }
  return { state: w, result }
}
