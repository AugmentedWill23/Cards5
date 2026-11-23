import { getCatalog } from '@/game/catalog'
import { commitCommand, latestWorld } from '@/game/repository'
import { enforceRequestSafety } from '@/lib/request-safety'
import { appAuth } from '@/lib/app-auth'
import type { GameCommand, GameView } from '@/game/types'
import { expansionNeedsTick, expansionView } from '@/game/expansion'
import { BackendUnavailable } from '@/lib/supabase/server'
import { progressionView } from '@/game/progression'
import { advancement, packLock } from '@/game/advancement'
import { casinoView } from '@/game/casino'
import { projectWorld } from '@/game/view'
import { duplicateSaleQuote } from '@/game/quick-sale'

export async function GET(request: Request) {
  try {
    const user = await appAuth.currentUser()
    if (!user)
      return Response.json(
        { error: 'Create an account or sign in to enter the vault.' },
        { status: 401 },
      )
    const catalog = await getCatalog()
    if (!catalog.rules) throw new Error('Economy configuration is not published')
    let current = await latestWorld(user)
    // Recover cleanly if signup created the account but its initial economy
    // append was interrupted. Joining an existing player never grants twice.
    if (!current.state.players[user.playerId]) {
      await commitCommand(user, {
        action: 'join',
        key: `join:${user.id}`,
        name: user.displayName,
        demo: false,
      })
      current = await latestWorld(user)
    }
    if (current.state.players[user.playerId]?.suspended)
      return Response.json(
        { error: 'Your account is suspended. Contact an operator.' },
        { status: 403 },
      )
    if (
      user &&
      !current.state.players[user.playerId]?.suspended &&
      Object.values(current.state.trades).some(
        (t) => t.status === 'pending' && Date.parse(t.expires) <= Date.now(),
      )
    ) {
      await commitCommand(user, {
        action: 'expire',
        key: `expiry:${current.sequence}:${user.playerId}`,
      })
      current = await latestWorld(user)
    }
    if (expansionNeedsTick(current.state, Date.now())) {
      await commitCommand(user, {
        action: 'tick',
        key: `auction-tick:${current.sequence}:${user.playerId}:${Math.floor(Date.now() / 1000)}`,
      })
      current = await latestWorld(user)
    }
    const { state: w, sequence } = current
    const actor = user.playerId
    const player = w.players[actor]
    const expansion = expansionView(w, actor, catalog.rules)
    const serverTime = Date.now()
    if (new URL(request.url).searchParams.get('live') === '1')
      return Response.json(
        { expansion, player, serverTime, sequence, casino: casinoView(w, actor, serverTime), progression: progressionView(w, actor, serverTime, catalog.rules) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    const projected = projectWorld(w, catalog.rules)
    const progress = advancement(w, actor, catalog.rules)
    const currentCard = (c: (typeof w.cards)[string]) => projected.cards[c.id]
    const inventory = Object.values(w.cards).filter(c => c.owner === actor && c.status !== 'burned')
    const publicCards = Object.values(projected.cards)
      .filter((c) => c.status !== 'burned' && !w.players[c.owner]?.privateCollection)
      .map(currentCard)
    const view = {
      player,
      progression: progressionView(w, actor, serverTime, catalog.rules),
      casino: casinoView(w, actor, serverTime),
      expansion,
      serverTime,
      preview: false,
      sequence,
      catalogRevision: catalog.revision,
      ...catalog,
      packs: catalog.packs.map((p) => ({
        ...p,
        lockedReason: packLock(p, progress, catalog.rules),
        remainingStock:
          p.stock == null ? null : Math.max(0, p.stock - (w.counters[`stock:${p.id}`] || 0)),
      })),
      cards: inventory.map(currentCard),
      duplicateSale: duplicateSaleQuote(inventory, actor, c => currentCard(c).snapshot),
      publicCards,
      listings: Object.values(w.listings)
        .filter((l) => l.status === 'active')
        .map((l) => ({
          ...l,
          cardData: currentCard(w.cards[l.card]),
          sellerName: w.players[l.seller]?.name || 'Collector',
        })),
      trades: Object.values(w.trades).filter((t) => t.from === actor || t.to === actor),
      players: Object.values(w.players)
        .filter((p) => !p.suspended)
        .map((p) => ({
          id: p.id,
          name: p.name,
          demo: p.demo,
          joined: p.joined,
          hidden: p.hidden,
          ...projected.stats[p.id],
        }))
        .map((p) =>
          p.hidden && p.id !== actor
            ? {
                ...p,
                balance: 0,
                collectionValue: 0,
                highestCard: 0,
                perfects: 0,
                rarityRank: -1,
                salesCount: 0,
              }
            : p,
        ),
      receipts: w.receipts.filter((r) => r.player === actor),
      ledger: w.ledger
        .filter((l) => l.player === actor)
        .slice(-40)
        .reverse(),
      sales: w.sales.slice(-100),
    } satisfies Partial<GameView>
    return Response.json(view, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The vault could not be loaded. Please try again.',
      },
      { status: 503 },
    )
  }
}
export async function POST(request: Request) {
  try {
    enforceRequestSafety(request, 'game', 120)
    const user = await appAuth.currentUser()
    if (!user)
      return Response.json({ error: 'Create an account or sign in to play.' }, { status: 401 })
    const text = await request.text()
    if (text.length > 32768) throw new Error('Game request is too large.')
    const command = JSON.parse(text) as GameCommand
    if (!command || typeof command.action !== 'string' || typeof command.key !== 'string')
      throw new Error('Invalid game command')
    const result = await commitCommand(user, command)
    return Response.json({ result })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Action failed. No changes were committed.',
      },
      { status: error instanceof BackendUnavailable ? 503 : 400 },
    )
  }
}
