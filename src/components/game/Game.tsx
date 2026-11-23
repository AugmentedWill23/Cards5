'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { OperatorEntry } from './OperatorEntry'
import Expansion from './Expansion'
import Casino from './Casino'
import { dailyBaseReward } from '@/game/advancement'
import { PullCelebration } from './CardEffects'
import { Icon, toneStyle } from './icons'
import {
  Button,
  CardTile,
  Credits,
  Empty,
  Field,
  fmt,
  Modal,
  PackVisual,
  rarityTone,
  Tag,
} from './ui'
import { rarities, qualities, mutations, marketValue } from '@/game/rules'
import type { Card, CommandResult, GameCommand, GameView, Pack, Trade } from '@/game/types'
import {
  AuthForm,
  CardDetail,
  Collection,
  Guide,
  Leaderboards,
  ListingForm,
  Market,
  Odds,
  PackPurchase,
  Settings,
  Shop,
  Slots,
  TradeForm,
  TradeReview,
  Trading,
  Updates,
} from './screens'

const navigation = [
  { id: 'home', label: 'Overview', icon: 'home', href: '/' },
  { id: 'slots', label: 'Lucky Slots', icon: 'slots', href: '/slots' },
  { id: 'casino', label: 'Casino & Battles', icon: 'spark', href: '/casino' },
  { id: 'packs', label: 'Pack Shop', icon: 'packs', href: '/packs', badge: '7' },
  { id: 'collection', label: 'My Collection', icon: 'collection', href: '/collection' },
  { id: 'grading', label: 'Grading Desk', icon: 'shield', href: '/grading' },
  { id: 'display', label: 'Card Display', icon: 'display', href: '/display' },
  { id: 'earn', label: 'Earn Credits', icon: 'coin', href: '/earn' },
  { id: 'market', label: 'Player Market', icon: 'market', href: '/market' },
  { id: 'auctions', label: 'Card Auctions', icon: 'auction', href: '/auctions' },
  { id: 'storage', label: 'Mystery Storage', icon: 'storage', href: '/storage' },
  { id: 'trades', label: 'Trading', icon: 'trade', href: '/trades' },
  { id: 'chat', label: 'Collector Chat', icon: 'chat', href: '/chat' },
  { id: 'leaderboards', label: 'Leaderboards', icon: 'trophy', href: '/leaderboards' },
  { id: 'updates', label: 'Update Log', icon: 'updates', href: '/updates' },
]
const inputClass =
  'w-full rounded-lg border border-white/10 bg-[#101016] px-3 py-2.5 text-xs text-[#d9d2e5] outline-none placeholder:text-[#655f72] focus:border-[#a28bf5]/60'
type Dialog = {
  type:
    | 'auth'
    | 'help'
    | 'card'
    | 'odds'
    | 'pack'
    | 'sell'
    | 'list'
    | 'buy'
    | 'trade'
    | 'tradeReview'
    | 'history'
  card?: Card
  pack?: Pack
  cards?: Card[]
  duplicateSale?: NonNullable<GameView['duplicateSale']>
  listing?: GameView['listings'][number]
  trade?: Trade
  catalogRevision?: string
}
export default function Game({ initialTab }: { initialTab: string }) {
  const router = useRouter()
  const [view, setView] = useState<GameView | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [error, setError] = useState('')
  const [pendingRecovery, setPendingRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [mobile, setMobile] = useState(false)
  const [opening, setOpening] = useState<{ cards: Card[]; done: boolean; pack: string } | null>(
    null,
  )
  const [seen, setSeen] = useState('')
  const [isOperator, setIsOperator] = useState(false)
  const inFlight = useRef(false)
  const loading = useRef<Promise<void> | null>(null)
  const knownSequence = useRef(-1)
  const load = useCallback(async (afterCommand = false) => {
    if (loading.current) {
      await loading.current
      if (!afterCommand) return
    }
    const request = (async () => {
      try {
        const res = await fetch('/api/game', { cache: 'no-store' })
        const data = await res.json()
        if (res.status === 401) {
          setView(null)
          setSignedOut(true)
          setError('')
          return
        }
        if (!res.ok) throw new Error(data.error)
        setSignedOut(false)
        knownSequence.current = Math.max(knownSequence.current, data.sequence)
        setView((previous) => (!previous || data.sequence >= previous.sequence ? data : previous))
        setError('')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not connect to the vault')
      }
    })()
    loading.current = request
    await request
    if (loading.current === request) loading.current = null
  }, [])
  useEffect(() => {
    void load()
    setPendingRecovery(!!sessionStorage.getItem('vault-pending-command'))
    setSeen(localStorage.getItem('vault-updates-seen') || '')
    void fetch('/api/operator')
      .then((r) => r.json())
      .then((d) => setIsOperator(d.authorized === true))
      .catch(() => {})
  }, [load])
  useEffect(() => {
    const id = setInterval(() => {
      if (!inFlight.current && !busy && !opening && !document.hidden) void load()
    }, 20000)
    return () => clearInterval(id)
  }, [load, busy, opening])
  useEffect(() => {
    if (
      !view?.player.id ||
      signedOut ||
      !['auctions', 'storage', 'chat', 'display', 'earn', 'casino'].includes(initialTab)
    )
      return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const poll = async () => {
      try {
        if (!inFlight.current && !document.hidden) {
          const response = await fetch('/api/game?live=1', {
            cache: 'no-store',
            signal: controller.signal,
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Live synchronization interrupted.')
          if (!stopped && data.sequence > knownSequence.current) {
            await load()
            return
          }
          if (!stopped)
            setView((previous) =>
              previous && data.sequence >= previous.sequence ? { ...previous, ...data } : previous,
            )
        }
      } catch (error) {
        if (!stopped)
          setError(error instanceof Error ? error.message : 'Live synchronization interrupted.')
      } finally {
        if (!stopped) timer = setTimeout(poll, ['auctions', 'storage', 'casino'].includes(initialTab) ? 2500 : initialTab === 'chat' ? 5000 : 20000)
      }
    }
    void poll()
    return () => {
      stopped = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [initialTab, signedOut, view?.player.id, load])
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(''), 6000)
      return () => clearTimeout(id)
    }
  }, [notice])
  useEffect(() => {
    if (opening && !opening.done) {
      const id = setTimeout(
        () => setOpening((o) => o && { ...o, done: true }),
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 5100 + (opening.cards.length - 1) * 80,
      )
      return () => clearTimeout(id)
    }
  }, [opening])
  useEffect(() => {
    if (initialTab === 'updates' && view?.updates[0]) {
      const value = String(view.updates[0].publishedAt)
      localStorage.setItem('vault-updates-seen', value)
      setSeen(value)
    }
  }, [initialTab, view])
  async function account(action: string, data: Record<string, unknown> = {}) {
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error)
    if (!result.confirmationRequired) {
      sessionStorage.removeItem('vault-pending-command')
      setPendingRecovery(false)
      if (action === 'logout') setIsOperator(false)
      else {
        try {
          const response = await fetch('/api/operator', { cache: 'no-store' })
          const operator = await response.json()
          setIsOperator(operator.authorized === true)
        } catch {
          setIsOperator(false)
        }
      }
    }
    return result
  }
  function retryPendingAction() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('vault-pending-command') || 'null')
      if (!saved?.signature) return
      const command = JSON.parse(saved.signature)
      void act(command).then(result => {
        if (result && ['quickSell', 'quickSellDuplicates'].includes(command.action))
          setDialog(current => current?.type === 'sell' ? null : current)
      })
    } catch {
      setError('The local retry record is unreadable. Check your opening/transaction history before making another purchase.')
    }
  }
  async function act(command: Omit<GameCommand, 'key'>) {
    if (inFlight.current) return null
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      if (!view || signedOut) throw new Error('Sign in to continue')
      const signature = JSON.stringify(command)
      const saved = JSON.parse(sessionStorage.getItem('vault-pending-command') || 'null') as {
        signature: string
        key: string
      } | null
      if (saved && saved.signature !== signature)
        throw new Error('A previous action is unconfirmed. Retry it before starting another transaction.')
      const key = saved?.key ?? (crypto.randomUUID?.() ??
        Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''))
      sessionStorage.setItem('vault-pending-command', JSON.stringify({ signature, key }))
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...command, key }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status < 500) {
          sessionStorage.removeItem('vault-pending-command')
          setPendingRecovery(false)
          await load(true)
        } else setPendingRecovery(true)
        throw new Error(data.error)
      }
      sessionStorage.removeItem('vault-pending-command')
      setPendingRecovery(false)
      await load(true)
      setNotice(data.result.message)
      return data.result as CommandResult
    } catch (e) {
      if (sessionStorage.getItem('vault-pending-command')) setPendingRecovery(true)
      setError(e instanceof Error ? e.message : 'Action failed. Try again.')
      return null
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  const newUpdate = !!view?.updates[0] && view.updates[0].publishedAt > seen
  const cards = view?.cards || []
  const tv = cards.reduce((n, c) => n + c.snapshot.tv, 0)
  const close = () => setDialog(null)
  const inspect = (card: Card) => setDialog({ type: 'card', card })
  const heading = navigation.find((n) => n.id === initialTab)?.label || 'Profile & Settings'

  if (signedOut)
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#101015] px-6 py-12 text-[#eae6f0]">
        <OperatorEntry />
        <div className="pointer-events-none absolute -left-40 top-0 h-180 w-180 rounded-full bg-[#9c73e9]/6 blur-[130px]" />
        <div className="relative grid w-full max-w-250 items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <section>
            <div className="mb-12 flex items-center gap-3 text-[#baa0f0]">
              <Icon name="diamond" size={30} />
              <span className="font-display text-2xl font-bold tracking-[.2em] text-white">
                VAULT
              </span>
            </div>
            <Tag>THE TEXT-ONLY COLLECTING GAME</Tag>
            <h1 className="mt-7 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Great finds.
              <br />
              <span className="text-[#b79bf1]">Entirely yours.</span>
            </h1>
            <p className="mt-6 max-w-95 text-sm leading-7 text-[#9b91aa]">
              Open packs. Discover extraordinary attributes. Build a collection worth keeping—or
              make your next move on the player market.
            </p>
            <div className="mt-9 grid max-w-100 grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-5">
              {[
                ['1,250', 'starter credits'],
                ['12', 'standard rarities'],
                ['Custom', 'pack releases'],
              ].map(([value, label]) => (
                <div key={label} className="px-3 first:pl-0">
                  <p className="font-display text-2xl text-[#dac9f5]">{value}</p>
                  <p className="mt-1 text-[10px] text-[#8f829e]">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-center gap-2 text-[10px] text-[#746981]">
              <Icon name="shield" size={14} /> Saved to your account. Play credits only. No
              real-money value.
            </p>
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#19151f]/90 p-7 shadow-2xl sm:p-9">
            <p className="mb-2 text-[10px] font-medium tracking-[.18em] text-[#9d80bf]">
              YOUR COLLECTION STARTS HERE
            </p>
            <h2 className="mb-5 font-display text-2xl">Enter the vault.</h2>
            <AuthForm
              account={account}
              onSuccess={() => {
                void load()
                router.refresh()
              }}
            />
          </section>
        </div>
      </main>
    )

  return (
    <div className="min-h-screen bg-[#101015] text-[#eae6f0]">
      <OperatorEntry />
      {mobile && (
        <button
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-55 flex-col overflow-y-auto border-r border-white/[.065] bg-[#131318] transition-transform lg:translate-x-0 ${mobile ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Link
          href="/"
          className="flex h-20 shrink-0 items-center gap-3 px-7"
          aria-label="Vault home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#a38bed] text-[#18131e]">
            <Icon name="diamond" size={23} />
          </div>
          <span className="font-display text-[24px] font-bold tracking-[.16em]">
            VAULT<span className="ml-0.5 align-top text-[8px] text-[#a28bf5]">™</span>
          </span>
        </Link>
        <div className="mx-5 mb-5 h-px bg-white/[.065]" />
        <p className="mb-3 px-7 text-[9px] font-semibold tracking-[.16em] text-[#65606f]">
          PLAY & COLLECT
        </p>
        <nav className="space-y-1 px-3">
          {navigation.map((n, i) => (
            <div key={n.id}>
              {n.id === 'market' && (
                <>
                  <div className="mx-3 my-5 h-px bg-white/[.065]" />
                  <p className="mb-3 px-4 text-[9px] font-semibold tracking-[.16em] text-[#65606f]">
                    THE COMMUNITY
                  </p>
                </>
              )}
              <Link
                href={n.href}
                onClick={() => setMobile(false)}
                className={`group relative flex h-10 items-center gap-3 rounded-lg px-4 text-[12px] transition ${initialTab === n.id ? 'bg-[#a28bf5]/10 font-medium text-[#b5a0fa]' : 'text-[#96909f] hover:bg-white/3 hover:text-[#e3dcea]'}`}
              >
                {initialTab === n.id && (
                  <span className="absolute -left-3 top-3 h-5 w-0.5 rounded-r bg-[#b39af9]" />
                )}
                <Icon name={n.icon} size={18} />
                <span>{n.label}</span>
                {n.badge && (
                  <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-[#a9a1b8]">
                    {view?.packs.filter((p) => !p.limited).length ?? n.badge}
                  </span>
                )}
                {n.id === 'updates' && newUpdate && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#aa90f5]" />
                )}
              </Link>
            </div>
          ))}
        </nav>
        <div className="mt-auto px-4 pb-5 pt-8">
          <div className="rounded-xl border border-[#b096f0]/12 bg-linear-to-br from-[#a28bf5]/8 to-transparent p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-[#d3c4f5]">
              <Icon name="spark" size={16} /> A little luck, every day.
            </div>
            <p className="text-[10px] leading-5 text-[#857b98]">
              Your next great find starts with a few free credits.
            </p>
            <button
              onClick={() => void act({ action: 'daily' })}
              disabled={busy || view?.player.lastDaily === new Date().toISOString().slice(0, 10)}
              className="mt-3 flex w-full items-center justify-between text-[10px] font-medium text-[#baa4f5] disabled:opacity-40"
            >
              {view?.player.lastDaily === new Date().toISOString().slice(0, 10)
                ? 'Daily reward claimed'
                : 'Claim daily reward'}
              <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="mt-5 space-y-1">
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-lg p-3 text-[11px] text-[#8c8599] hover:bg-white/4"
            >
              <Icon name="settings" size={17} />
              Profile & Settings
            </Link>
            {isOperator && (
              <button
                onClick={() => window.dispatchEvent(new Event('vault-operator-entry'))}
                className="flex items-center gap-3 p-3 text-[11px] text-[#b5a0fa]"
              >
                <Icon name="shield" size={17} />
                Operator console
              </button>
            )}
            <button
              onClick={() => setDialog({ type: 'help' })}
              className="flex w-full items-center gap-3 rounded-lg p-3 text-[11px] text-[#8c8599] hover:bg-white/4"
            >
              <Icon name="help" size={17} />
              The collector’s guide
              <Icon name="arrow" size={12} className="ml-auto" />
            </button>
          </div>
          <div className="mx-3 mt-5 flex items-center gap-2 text-[9px] text-[#645f6e]">
            <span className="h-1 w-1 rounded-full bg-[#67bc9c]" /> ALL SYSTEMS OPERATIONAL{' '}
            <span className="ml-auto">v1.0</span>
          </div>
        </div>
      </aside>
      <div className="lg:pl-55">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-white/[.065] bg-[#131318]/95 px-5 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
              className="p-1 text-[#a59bae] lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <span className="text-[12px] font-medium">{heading}</span>
            <span className="hidden text-[#3b3545] sm:block">/</span>
            <span className="hidden text-[10px] text-[#6e667c] sm:block">
              Your collection. Your legacy.
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2 rounded-lg border border-[#d4bd83]/15 bg-[#d4bd83]/4 px-3 py-2">
              <Icon name="coin" size={16} className="text-[#d5bd82]" />
              <span className="text-[12px] font-semibold text-[#e1cd9e]">
                {fmt(view?.player.balance || 0)}
              </span>
              <span className="hidden text-[9px] text-[#9f8c62] sm:inline">credits</span>
              <button
                onClick={() => void act({ action: 'daily' })}
                aria-label="Claim free daily credits"
                className="ml-1 border-l border-[#d4bd83]/15 pl-2 text-[#b69d68]"
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
            <Link
              href="/updates"
              aria-label="Updates and notifications"
              className="relative hidden text-[#96909f] sm:block"
            >
              <Icon name="bell" size={19} />
              {newUpdate && (
                <span className="absolute right-0 top-0 h-1 w-1 rounded-full bg-[#ab92f4]" />
              )}
            </Link>
            <div className="hidden h-7 w-px bg-white/8 sm:block" />
            <button
              onClick={() =>
                view?.preview ? setDialog({ type: 'auth' }) : router.push('/settings')
              }
              className="flex items-center gap-2.5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ba9af5]/20 bg-[#a28bf5]/10 font-display text-xs text-[#bca3f5]">
                {view?.player.name?.slice(0, 2).toUpperCase() || 'VC'}
              </span>
              <span className="hidden text-left md:block">
                <span className="block text-[11px] font-medium">
                  {view?.player.name || 'Collector'}
                </span>
                <span className="mt-0.5 block text-[8px] text-[#7e748f]">COLLECTOR</span>
              </span>
              <Icon name="down" size={12} className="hidden text-[#756c84] md:block" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-380 px-5 py-7 sm:px-8 lg:py-8">
          {pendingRecovery && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/20 bg-amber-200/5 p-4 text-xs leading-6 text-amber-100"><span>An economic action is unconfirmed. Retrying its original key cannot grant or charge twice.</span><Button variant="secondary" disabled={busy} onClick={retryPendingAction}>Retry pending action</Button></div>}
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-center gap-3 rounded-lg border border-rose-400/25 bg-rose-400/8 p-4 text-xs text-rose-200"
            >
              <Icon name="info" size={17} />
              <span className="flex-1">{error}</span>
              <button onClick={() => void load()} className="underline">
                Retry
              </button>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <Icon name="x" size={15} />
              </button>
            </div>
          )}
          {!view ? (
            <div aria-busy="true" aria-label="Loading your vault" className="animate-pulse">
              <div className="mb-8 h-14 w-72 rounded-lg bg-white/5" />
              <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-25 rounded-xl border border-white/5 bg-white/3" />
                ))}
              </div>
              <div className="h-72 rounded-2xl bg-linear-to-r from-[#251e38] to-[#17151e]" />
            </div>
          ) : (
            <>
              {initialTab === 'home' && (
                <Dashboard
                  view={view}
                  tv={tv}
                  onInspect={inspect}
                  onPack={(pack) => setDialog({ type: 'pack', pack, catalogRevision: view.catalogRevision })}
                  onDaily={() => void act({ action: 'daily' })}
                  busy={busy}
                />
              )}
              {['grading', 'display', 'earn', 'auctions', 'storage', 'chat'].includes(
                initialTab,
              ) && (
                <Expansion
                  tab={initialTab}
                  view={view}
                  act={act}
                  busy={busy}
                  error={error}
                  inspect={inspect}
                  onOpening={(cards, pack) => setOpening({ cards, pack, done: false })}
                />
              )}
              {initialTab === 'packs' && (
                <Shop
                  view={view}
                  onPack={(pack) => setDialog({ type: 'pack', pack, catalogRevision: view.catalogRevision })}
                  onOdds={(pack) => setDialog({ type: 'odds', pack, catalogRevision: view.catalogRevision })}
                  onHistory={() => setDialog({ type: 'history' })}
                />
              )}
              {initialTab === 'collection' && (
                <Collection
                  view={view}
                  onInspect={inspect}
                  onSell={(cards) => setDialog({ type: 'sell', cards })}
                  onSellDuplicates={(duplicateSale) => {
                    const ids = new Set(duplicateSale.ids)
                    setDialog({ type: 'sell', duplicateSale, cards: view.cards.filter(c => ids.has(c.id)) })
                  }}
                />
              )}
              {initialTab === 'market' && (
                <Market
                  view={view}
                  onInspect={inspect}
                  onBuy={(listing) => setDialog({ type: 'buy', listing, card: listing.cardData })}
                  onList={() => router.push('/collection')}
                  act={act}
                />
              )}
              {initialTab === 'slots' && <Slots view={view} act={act} busy={busy} />}
              {initialTab === 'casino' && <Casino view={view} act={act} busy={busy} />}
              {initialTab === 'trades' && (
                <Trading
                  view={view}
                  onCreate={() => setDialog({ type: 'trade' })}
                  onReview={(trade) => setDialog({ type: 'tradeReview', trade })}
                />
              )}
              {initialTab === 'leaderboards' && <Leaderboards view={view} />}
              {initialTab === 'updates' && <Updates view={view} />}
              {initialTab === 'settings' && (
                <Settings
                  view={view}
                  act={act}
                  busy={busy}
                  onAuth={() => setDialog({ type: 'auth' })}
                  onLogout={async () => {
                    try {
                      await account('logout')
                      await load()
                      setNotice('Signed out. Your collection is safely stored.')
                      router.refresh()
                    } catch {
                      setError('Could not sign out. Try again.')
                    }
                  }}
                />
              )}
            </>
          )}
          <footer className="mt-9 flex flex-col justify-between gap-3 border-t border-white/[.06] pt-5 text-[9px] leading-5 text-[#655d74] sm:flex-row">
            <p>
              VAULT © {new Date().getFullYear()} <span className="mx-2 text-[#39323f]">/</span>{' '}
              Collect something extraordinary.
            </p>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <Icon name="shield" size={12} />
                Play credits only. No real-money value.
              </span>
              <button
                onClick={() => setDialog({ type: 'help' })}
                className="text-[#9589a6] hover:text-[#c5b3eb]"
              >
                Fair play & odds
              </button>
            </div>
          </footer>
        </main>
      </div>
      {notice && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-60 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[#ab93f4]/25 bg-[#25202f] px-5 py-4 text-xs text-[#e4d9f8] shadow-2xl"
        >
          <Icon name="check" size={17} className="shrink-0 text-[#b6a1f5]" />
          {notice}
          <button onClick={() => setNotice('')} aria-label="Dismiss notification">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={
            dialog.type === 'auth'
              ? 'Your collection starts here.'
              : dialog.type === 'help'
                ? 'The collector’s guide'
                : dialog.type === 'card'
                  ? dialog.card!.name
                  : dialog.type === 'odds'
                    ? `${dialog.pack!.name} · Odds`
                    : dialog.type === 'pack'
                      ? 'Make room for your next find.'
                      : dialog.type === 'sell'
                        ? dialog.duplicateSale ? 'Review duplicate sale' : 'Confirm permanent quick sale'
                        : dialog.type === 'list'
                          ? 'Set your asking price'
                          : dialog.type === 'buy'
                            ? 'Review market purchase'
                            : dialog.type === 'history'
                              ? 'Opening receipts'
                              : dialog.type === 'tradeReview'
                                ? 'Review the exact exchange'
                                : 'Propose a trade'
          }
          onClose={close}
          wide={['card', 'odds', 'trade', 'tradeReview'].includes(dialog.type)}
        >
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-rose-400/25 bg-rose-400/8 p-3 text-[11px] leading-6 text-rose-200"
            >
              {error}
            </p>
          )}
          {pendingRecovery && <Button className="mb-4" variant="secondary" disabled={busy} onClick={retryPendingAction}>Retry pending action</Button>}
          {dialog.type === 'auth' && (
            <AuthForm
              account={account}
              onSuccess={async () => {
                close()
                await load()
                router.refresh()
              }}
            />
          )}
          {dialog.type === 'help' && <Guide rules={view?.rules} />}
          {dialog.type === 'card' && view && (
            <CardDetail
              card={view.cards.find((c) => c.id === dialog.card!.id) || dialog.card!}
              view={view}
              onSell={(card) => setDialog({ type: 'sell', cards: [card] })}
              onList={(card) => setDialog({ type: 'list', card })}
              onTrade={() => setDialog({ type: 'trade', card: dialog.card })}
            />
          )}
          {dialog.type === 'odds' && view && <Odds pack={dialog.pack!} rules={view.rules} />}
          {dialog.type === 'pack' && (
            <PackPurchase
              pack={dialog.pack!}
              busy={busy}
              balance={view?.player.balance || 0}
              onOdds={() => setDialog({ type: 'odds', pack: dialog.pack, catalogRevision: dialog.catalogRevision })}
              onOpen={async (count) => {
                const result = await act({
                  action: 'open',
                  pack: String(dialog.pack!.id),
                  count,
                  expectedPrice: dialog.pack!.price * count,
                  expectedCatalog: dialog.catalogRevision,
                })
                if (result?.cards) {
                  close()
                  setOpening({ cards: result.cards, done: false, pack: dialog.pack!.name })
                }
              }}
            />
          )}
          {dialog.type === 'sell' && (
            <div>
              {dialog.duplicateSale && (
                <p className="mb-3 text-xs leading-6 text-[#c7b4e8]">
                  This checks your whole collection, not just the current filters. It keeps the
                  highest-value standard copy of each design and never sells Limited, Perfect,
                  listed, displayed, auctioned, or trade-locked cards.
                </p>
              )}
              <p className="text-xs leading-6 text-[#a69cad]">
                These {fmt(dialog.duplicateSale?.ids.length ?? dialog.cards!.length)} cards will be permanently removed from circulation.
                This convenience sale is final and cannot be undone.
              </p>
              <div className="my-5 max-h-55 overflow-auto space-y-2">
                {dialog.cards!.slice(0,100).map((c) => (
                  <div
                    key={c.id}
                    className="flex justify-between rounded-lg bg-white/3 p-3 text-xs"
                  >
                    <span>
                      {c.name} <span className="text-[#82778f]">· {c.attributes.rarity}</span>
                    </span>
                    <Credits value={c.snapshot.qsv} />
                  </div>
                ))}
                {dialog.cards!.length > 100 && (
                  <p className="p-3 text-xs text-[#a69cad]">And {fmt(dialog.cards!.length - 100)} more duplicates included in the total below.</p>
                )}
              </div>
              <div className="mb-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
                <span>You receive · 65% of TV</span>
                <Credits value={dialog.duplicateSale?.credits ?? dialog.cards!.reduce((n, c) => n + c.snapshot.qsv, 0)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={close}>
                  Keep cards
                </Button>
                <Button
                  variant="danger"
                  disabled={busy || pendingRecovery}
                  onClick={async () => {
                    if (
                      await act(dialog.duplicateSale ? {
                        action: 'quickSellDuplicates',
                        quote: dialog.duplicateSale.token,
                      } : {
                        action: 'quickSell',
                        cards: dialog.cards!.map((c) => c.id),
                        expectedQsv: dialog.cards!.reduce((n, c) => n + c.snapshot.qsv, 0),
                      })
                    )
                      close()
                  }}
                >
                  {busy ? 'Committing…' : 'Permanently quick-sell'}
                </Button>
              </div>
            </div>
          )}
          {dialog.type === 'list' && view && (
            <ListingForm
              card={dialog.card!}
              view={view}
              busy={busy}
              onSubmit={async (price) => {
                if (await act({ action: 'list', card: dialog.card!.id, price })) close()
              }}
            />
          )}
          {dialog.type === 'buy' && view && (
            <div>
              <div className="mx-auto mb-5 max-w-55">
                <CardTile card={dialog.card!} />
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8b819b]">Seller</span>
                  <span>{dialog.listing!.sellerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8b819b]">PMV estimate · not a guarantee</span>
                  <Credits
                    value={
                      marketValue(dialog.card!.attributes, dialog.card!.snapshot.tv, view.sales)
                        .value
                    }
                  />
                </div>
                <div className="flex justify-between border-t border-white/10 pt-3">
                  <span>Asking price</span>
                  <Credits value={dialog.listing!.price} />
                </div>
              </div>
              <p className="my-4 text-[10px] leading-5 text-[#8a8099]">
                The server revalidates the price and ownership. Your purchase only completes if this
                listing is still available. Seller pays a {view.rules.fee * 100}% fee.
              </p>
              <Button
                className="w-full"
                disabled={busy || (!view.preview && view.player.balance < dialog.listing!.price)}
                onClick={async () => {
                  if (
                    await act({
                      action: 'buy',
                      listing: dialog.listing!.id,
                      price: dialog.listing!.price,
                    })
                  )
                    close()
                }}
              >
                {busy ? (
                  'Completing purchase…'
                ) : (
                  <>
                    Confirm purchase <Credits value={dialog.listing!.price} />
                  </>
                )}
              </Button>
            </div>
          )}
          {dialog.type === 'trade' && view && (
            <TradeForm
              view={view}
              initialCard={dialog.card}
              initialTrade={dialog.trade}
              busy={busy}
              onSubmit={async (data) => {
                if (await act(data)) close()
              }}
            />
          )}
          {dialog.type === 'tradeReview' && view && (
            <TradeReview
              trade={view.trades.find((t) => t.id === dialog.trade!.id) || dialog.trade!}
              view={view}
              busy={busy}
              act={act}
              onEdit={() => setDialog({ type: 'trade', trade: dialog.trade })}
            />
          )}
          {dialog.type === 'history' && view && (
            <div className="space-y-3">
              {view.receipts.length ? (
                [...view.receipts].reverse().map((r) => (
                  <details key={r.id} className="rounded-lg border border-white/10 p-4">
                    <summary className="cursor-pointer text-xs">
                      {r.pack}{' '}
                      <span className="ml-2 text-[#9386a5]">
                        {new Date(r.at).toLocaleString()} · {r.cards.length} cards
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2 text-[10px] text-[#9e91b1]">
                      <p>Receipt: {r.id}</p>
                      <p>Committed cost: {fmt(r.cost)} credits</p>
                      {r.cards.map((id) => (
                        <p key={id}>
                          {view.cards.find((c) => c.id === id)?.name ||
                            'Transferred / quick-sold card'}{' '}
                          · {id}
                        </p>
                      ))}
                    </div>
                  </details>
                ))
              ) : (
                <Empty title="Your first receipt is waiting">
                  Every pack opening is saved before the reveal begins.
                </Empty>
              )}
            </div>
          )}
        </Modal>
      )}
      {opening && (
        <Modal
          title={
            opening.done
              ? 'Meet your newest collectibles.'
              : 'Something extraordinary is on its way.'
          }
          subtitle={`${opening.pack} · ${opening.cards.length} server-committed cards · animation does not affect outcomes`}
          wide
          onClose={() => setOpening(null)}
        >
          {!opening.done ? (
            <>
              <div className="space-y-3">
                {opening.cards.map((c, row) => (
                  <div
                    key={c.id}
                    className="reel-window relative h-35 overflow-hidden rounded-xl border border-white/10 bg-[#0f0f15]"
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 bg-[#c1a7ff] shadow-[0_0_14px_#ae86ff]" />
                    <div className="pointer-events-none absolute inset-0 z-10 bg-linear-to-r from-[#0f0f15] via-transparent to-[#0f0f15]" />
                    <div
                      className="reel-track absolute left-[calc(50%-68px)] top-3 flex gap-3"
                      style={{ animationDelay: `${row * 80}ms` }}
                    >
                      {Array.from({ length: 23 }, (_, i) => (
                        <div
                          key={i}
                          style={toneStyle(
                            rarityTone(
                              i === 18
                                ? c.attributes.rarity
                                : rarities[(i * 7 + row * 3) % rarities.length],
                            ),
                          )}
                          className="flex h-28 w-34 shrink-0 flex-col items-center justify-center rounded-lg border border-[color:var(--tone)]/30 bg-[#1b1824] px-2 text-center"
                        >
                          <Icon
                            name="diamond"
                            size={22}
                            className="mb-3 text-[color:var(--tone)]"
                          />
                          <p className="font-display text-sm text-[color:var(--tone)]">
                            {i === 18
                              ? c.name
                              : ['Cipher', 'Eclipse', 'Monolith', 'Parallax'][i % 4]}
                          </p>
                          <span className="mt-1 text-[8px] text-[#8b8198]">
                            {i === 18
                              ? c.attributes.rarity
                              : rarities[(i * 7 + row * 3) % rarities.length]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => setOpening((o) => o && { ...o, done: true })}
                >
                  Skip animation <Icon name="arrow" size={15} />
                </Button>
              </div>
            </>
          ) : (
            <>
              <PullCelebration cards={opening.cards} />
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {opening.cards.map((c) => (
                  <CardTile
                    key={c.id}
                    card={c}
                    onClick={() => {
                      setOpening(null)
                      inspect(c)
                    }}
                  />
                ))}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                <div>
                  <p className="text-[10px] text-[#8f839e]">TOTAL TRUE VALUE</p>
                  <Credits
                    value={opening.cards.reduce((n, c) => n + c.snapshot.tv, 0)}
                    className="mt-1 text-lg"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const latest = new Map(view?.cards.map(c => [c.id, c]))
                      setDialog({ type: 'sell', cards: opening.cards.map(c => latest.get(c.id) ?? c) })
                      setOpening(null)
                    }}
                  >
                    Quick-sell all
                  </Button>
                  <Button
                    onClick={() => {
                      setOpening(null)
                      router.push('/collection')
                    }}
                  >
                    Keep & view collection <Icon name="arrow" size={14} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function SectionTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-2 text-[9px] font-semibold tracking-[.18em] text-[#a38bd9]">{eyebrow}</p>
        )}
        <h1 className="font-display text-[27px] font-medium tracking-[-.035em] sm:text-[30px]">
          {title}
        </h1>
        <p className="mt-2 text-[11px] leading-5 text-[#8d849c]">{description}</p>
      </div>
      {children}
    </div>
  )
}
function Dashboard({
  view,
  tv,
  onInspect,
  onPack,
  onDaily,
  busy,
}: {
  view: GameView
  tv: number
  onInspect: (c: Card) => void
  onPack: (p: Pack) => void
  onDaily: () => void
  busy: boolean
}) {
  const rank =
    [...view.players]
      .sort(
        (a, b) =>
          b.balance +
          ((b as unknown as { collectionValue: number }).collectionValue || 0) -
          (a.balance + ((a as unknown as { collectionValue: number }).collectionValue || 0)),
      )
      .findIndex((p) => p.id === view.player.id) + 1
  return (
    <>
      <SectionTitle
        title={
          view.preview
            ? 'Welcome to your next obsession.'
            : `Good to see you, ${view.player.name.split(' ')[0]}.`
        }
        description="A little luck. A sharp eye. A collection that’s entirely yours."
      >
        <div className="flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5 text-[9px] text-[#8e859c]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#6fbd9d]" />
          {view.preview || view.player.demo ? 'DEMO ECONOMY' : 'LIVE SANDBOX'}
          <span className="mx-1 text-[#423b4c]">•</span> SEASON 01
        </div>
      </SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: 'Wallet balance',
            value: <Credits value={view.player.balance} />,
            note: 'Ready for your next find',
            icon: 'wallet',
            tone: 'amber',
          },
          {
            label: 'Collection value',
            value: <Credits value={tv} />,
            note: 'Calculated True Value',
            icon: 'diamond',
            tone: 'violet',
          },
          {
            label: 'Cards collected',
            value: (
              <>
                {view.cards.length}
                <span className="ml-2 text-xs font-normal text-[#797080]">in your vault</span>
              </>
            ),
            note: `${view.cards.filter((c) => c.snapshot.perfect).length} Perfect · ${view.cards.filter((c) => c.attributes.limited).length} Limited`,
            icon: 'collection',
            tone: 'blue',
          },
          {
            label: 'Collector ranking',
            value: (
              <>
                #{rank || '—'}
                <span className="ml-2 text-xs font-normal text-[#797080]">this season</span>
              </>
            ),
            note: 'Based on estimated net worth',
            icon: 'trophy',
            tone: 'emerald',
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/[.075] bg-[#17171e] px-4 py-4 lg:px-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#9b91a8]">{s.label}</span>
              <span style={toneStyle(s.tone)} className="text-[color:var(--tone)]">
                <Icon name={s.icon} size={15} />
              </span>
            </div>
            <div className="mt-3 font-display text-[25px] font-medium tracking-tight">
              {s.value}
            </div>
            <p className="mt-2 text-[9px] text-[#71687e]">{s.note}</p>
          </div>
        ))}
      </div>
      <div className="mb-7 grid gap-4 xl:grid-cols-[1fr_280px]">
        <section className="hero-vault relative min-h-71 overflow-hidden rounded-2xl border border-[#a98bdd]/15 bg-[#1a1725] p-6 sm:p-8">
          <div className="relative z-10 max-w-full sm:max-w-[60%]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#b995ed]/20 bg-[#a081d8]/8 px-2.5 py-1 text-[7px] font-semibold tracking-[.18em] text-[#bca0ed]">
              <Icon name="spark" size={10} /> THE THRILL IS IN THE REVEAL
            </span>
            <h2 className="mt-5 font-display text-[29px] font-medium leading-[1.17] tracking-[-.04em] sm:text-[37px]">
              Not just cards.
              <br />
              Possibilities<span className="text-[#b89aee]">.</span>
            </h2>
            <p className="mt-3 max-w-70 text-[10px] leading-5 text-[#a396b8]">
              Chase the rare. Find your perfect. Open a pack and discover what belongs in your
              vault.
            </p>
            <Link
              href="/packs"
              className="mt-5 inline-flex items-center gap-3 rounded-lg bg-[#b19af4] px-4 py-2.5 text-[10px] font-semibold text-[#20182b] transition hover:bg-[#c8b5ff]"
            >
              <Icon name="packs" size={15} />
              Explore packs
              <Icon name="arrow" size={14} />
            </Link>
            <span className="ml-3 hidden text-[8px] text-[#837591] sm:inline">
              {view.packs.filter((p) => !p.limited).length} packs. Endless potential.
            </span>
          </div>
          <div className="hero-orbit absolute right-[-60px] top-[-40px] h-110 w-110 rounded-full border border-[#baa0ee]/6" />
          <div className="hero-orbit absolute right-[-20px] top-0 h-90 w-90 rounded-full border border-[#baa0ee]/8" />
          <div className="hero-card-back absolute right-6 top-14 hidden h-50 w-34 rotate-[16deg] rounded-xl border border-[#a79bc6]/25 bg-linear-to-br from-[#514359] to-[#211c30] p-4 opacity-65 sm:right-10 sm:block">
            <Icon name="diamond" size={30} className="text-[#ae9ac4]" />
            <p className="mt-12 font-display text-lg text-[#d2bddc]">Eclipse</p>
            <p className="mt-2 text-[7px] tracking-widest text-[#b49abc]">LEGENDARY</p>
          </div>
          <div className="hero-card-front absolute right-17 top-10 hidden h-53 w-35 -rotate-[12deg] rounded-xl border border-[#c5a4f1]/45 bg-linear-to-br from-[#423152] via-[#2b223b] to-[#211a2e] p-4 shadow-[-20px_10px_50px_#120f2099] sm:right-28 sm:block">
            <div className="flex justify-between text-[6px] tracking-[.15em] text-[#b699d7]">
              <span>VAULT / 0001</span>
              <Icon name="spark" size={11} />
            </div>
            <p className="mt-4 text-[6px] tracking-[.15em] text-[#c4a0e1]">GODLY SECRET</p>
            <div className="my-4 flex justify-center text-[#c2a0ee]">
              <Icon name="diamond" size={38} />
            </div>
            <p className="font-display text-xl text-[#dfc6f6]">Singularity</p>
            <p className="mt-1 text-[6px] tracking-[.14em] text-[#a992c1]">
              MINT CONDITION · GRADE 10
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-[#c2a0ee]/20 pt-2 text-[7px] text-[#c8a9ec]">
              <span>PERFECT</span>
              <span>№ 001</span>
            </div>
          </div>
          <span className="absolute bottom-4 right-5 text-[7px] tracking-[.1em] text-[#7d6d90]">
            ILLUSTRATIVE CARD · NOT AN AVAILABLE DROP
          </span>
        </section>
        <section className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[.075] bg-[#19191f] p-5">
          <div>
            <div className="flex items-center justify-between">
              <Tag tone="amber">
                <Icon name="spark" size={10} /> DAILY DROP
              </Tag>
              <Icon name="clock" size={14} className="text-[#766d82]" />
            </div>
            <div className="my-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#c9ad76]/20 bg-[#c9ad76]/7 text-[#dec18a]">
                <Icon name="coin" size={28} />
              </div>
              <div>
                <p className="font-display text-[28px] font-medium text-[#e2cda1]">
                  {fmt(dailyBaseReward(view.rules))}{' '}
                  <span className="text-[11px] font-normal text-[#968565]">credits</span>
                </p>
                <p className="text-[9px] text-[#817587]">On the house. Every day.</p>
              </div>
            </div>
            <p className="text-[10px] leading-5 text-[#968b9f]">
              A fresh start for your next great find. No purchase. Just possibilities.
            </p>
          </div>
          <div>
            <Button
              variant="secondary"
              className="mt-4 w-full border-[#c2a879]/20! bg-[#c2a879]/5! text-[#d8c195]!"
              disabled={busy || view.player.lastDaily === new Date().toISOString().slice(0, 10)}
              onClick={onDaily}
            >
              {view.player.lastDaily === new Date().toISOString().slice(0, 10) ? (
                <>
                  <Icon name="check" size={13} />
                  Claimed · see you tomorrow
                </>
              ) : (
                <>
                  Claim free credits
                  <Icon name="arrow" size={13} />
                </>
              )}
            </Button>
            <p className="mt-2 text-center text-[8px] text-[#6f647b]">Resets daily at 00:00 UTC</p>
          </div>
        </section>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon name="packs" size={17} className="text-[#a78bd7]" />
          <h2 className="font-display text-[16px] font-medium tracking-tight">
            Pick your next possibility
          </h2>
          <span className="hidden text-[9px] text-[#7c718a] sm:inline">
            Every pack tells a different story.
          </span>
        </div>
        <Link href="/packs" className="flex items-center gap-2 text-[10px] text-[#a38bbf]">
          View all packs
          <Icon name="arrow" size={13} />
        </Link>
      </div>
      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {view.packs
          .filter((p) => !p.limited)
          .map((pack, i) => (
            <div
              key={pack.id}
              className="group relative overflow-hidden rounded-xl border border-white/[.075] bg-[#17171e] p-4 transition hover:border-[#a28bf5]/30"
            >
              {i === 2 && (
                <span className="absolute left-3 top-3 z-10 rounded border border-[#b497ed]/20 bg-[#2b213e] px-1.5 py-0.5 text-[7px] font-semibold text-[#b9a0e6]">
                  COLLECTOR FAVORITE
                </span>
              )}
              <PackVisual pack={pack} small />
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-medium">{pack.name}</h3>
                  <p className="mt-1 text-[8px] text-[#7c7189]">
                    {pack.count} cards · {pack.subtitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-white/[.065] pt-3">
                <Credits value={pack.price} className="text-[11px] font-medium" />
                <button
                  onClick={() => onPack(pack)}
                  aria-label={`Open ${pack.name}`}
                  className="rounded-md border border-white/8 bg-white/3 p-1.5 text-[#a496b8] transition group-hover:border-[#a28bf5]/30 group-hover:bg-[#a28bf5]/10 group-hover:text-[#c2abff]"
                >
                  <Icon name="arrow" size={13} />
                </button>
              </div>
            </div>
          ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Icon name="collection" size={16} className="text-[#9e84c9]" />
              <h2 className="font-display text-[16px] font-medium">Inside your vault</h2>
              <span className="rounded bg-white/4 px-1.5 py-0.5 text-[8px] text-[#8d7d9e]">
                {view.cards.length}
              </span>
            </div>
            <Link href="/collection" className="flex items-center gap-2 text-[9px] text-[#a38bbf]">
              My collection
              <Icon name="arrow" size={12} />
            </Link>
          </div>
          {view.cards.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[...view.cards]
                .sort((a, b) => b.snapshot.tv - a.snapshot.tv)
                .slice(0, 3)
                .map((c) => (
                  <CardTile key={c.id} card={c} compact onClick={() => onInspect(c)} />
                ))}
            </div>
          ) : (
            <Empty title="An empty vault. An open possibility.">
              <Link href="/packs" className="text-[#b6a0f1]">
                Open your first pack to start collecting.
              </Link>
            </Empty>
          )}
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Icon name="history" size={16} className="text-[#9e84c9]" />
              <h2 className="font-display text-[16px] font-medium">Around the vault</h2>
            </div>
            <span className="text-[8px] text-[#7c7189]">SEEDED DEMO ACTIVITY</span>
          </div>
          <div className="rounded-xl border border-white/[.075] bg-[#17171e] px-4">
            {view.sales.length ? (
              [...view.sales]
                .reverse()
                .slice(0, 5)
                .map((s, i) => (
                  <div
                    key={`${s.card}-${i}`}
                    className="flex items-center gap-3 border-b border-white/5 py-4 last:border-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#b399e5]/12 bg-[#a58aff]/5 text-[#a58abd]">
                      <Icon name="trade" size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px]">
                        <span className="text-[#c9bdd7]">
                          {view.players.find((p) => p.id === s.buyer)?.name || 'Collector'}
                        </span>
                        <span className="text-[#82738f]"> collected </span>
                        <span
                          style={toneStyle(rarityTone(s.attributes.rarity))}
                          className="text-[color:var(--tone)]"
                        >
                          {s.attributes.rarity}
                        </span>
                      </p>
                      <p className="mt-1 text-[8px] text-[#675b73]">
                        {s.demo ? 'Demo sale' : 'Completed sale'} ·{' '}
                        {new Date(s.at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <Credits value={s.amount} className="text-[10px] text-[#bcaacb]" />
                  </div>
                ))
            ) : (
              <div className="py-12 text-center text-xs text-[#877693]">
                The market is quiet. Start a new story.
              </div>
            )}
            <Link
              href="/market"
              className="flex items-center justify-center gap-2 py-3.5 text-[9px] text-[#a18caf]"
            >
              Explore the player market
              <Icon name="arrow" size={12} />
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
