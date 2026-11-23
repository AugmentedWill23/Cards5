'use client'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from './icons'
import { Button, CardTile, Credits, Empty, Field, fmt, Modal, Tag } from './ui'
import { expansionRules, gradingFee, marketValue } from '@/game/rules'
import type { Card, CommandResult, GameCommand, GameView } from '@/game/types'
import type { AuctionView } from '@/game/expansion-types'
import ProgressionPanel from './ProgressionPanel'
import { useCardBrowser } from './CardBrowser'
import { dailyBaseReward, jobBaseReward } from '@/game/advancement'
import { storageTiers } from '@/game/expansion'

const input =
  'w-full rounded-lg border border-white/10 bg-[#100e17] px-3 py-3 text-xs text-[#e2d8ed] outline-none focus:border-[#b59aec]'
const panel = 'rounded-2xl border border-white/8 bg-[#19161f] p-5 sm:p-6'
type Act = (command: Omit<GameCommand, 'key'>) => Promise<CommandResult | null>
type Confirm = (title: string, description: ReactNode, command: Omit<GameCommand, 'key'>) => void
type Props = {
  view: GameView
  busy: boolean
  act: Act
  now: number
  confirm: Confirm
  inspect: (card: Card) => void
}
function Heading({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-3 text-[9px] font-semibold tracking-[.2em] text-[#a18abf]">{eyebrow}</p>
        <h1 className="font-display text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-170 text-xs leading-6 text-[#95879f]">{text}</p>
      </div>
      {children}
    </div>
  )
}
function Safety({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex gap-3 rounded-xl border border-[#aa8bdb]/15 bg-[#aa8bdb]/4 p-4 text-[10px] leading-6 text-[#a992bc]">
      <Icon name="shield" className="mt-1 shrink-0 text-[#b69bd5]" size={18} />
      <div>{children}</div>
    </div>
  )
}
function Count({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/2 p-4">
      <p className="text-[9px] text-[#8d7b9b]">{label}</p>
      <div className="mt-2 font-display text-xl text-[#dfcff3]">{value}</div>
    </div>
  )
}
function remaining(until: number, now: number) {
  const seconds = Math.max(0, Math.ceil((until - now) / 1000))
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
export default function Expansion({
  tab,
  view,
  act,
  busy,
  error,
  inspect,
  onOpening,
}: {
  tab: string
  view: GameView
  act: Act
  busy: boolean
  error: string
  inspect: (card: Card) => void
  onOpening: (cards: Card[], pack: string) => void
}) {
  const [clock, setClock] = useState(Date.now())
  const [offset, setOffset] = useState(0)
  const [confirmation, setConfirmation] = useState<{
    title: string
    description: ReactNode
    command: Omit<GameCommand, 'key'>
  } | null>(null)
  useEffect(() => {
    if (view.serverTime) setOffset(view.serverTime - Date.now())
  }, [view.serverTime])
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  const confirm: Confirm = (title, description, command) =>
    setConfirmation({ title, description, command })
  const props: Props = { view, act, busy, now: clock + offset, confirm, inspect }
  return (
    <>
      {tab === 'grading' && <Grading {...props} />}
      {tab === 'display' && <DisplayRoom {...props} />}
      {tab === 'earn' && <><ProgressionPanel view={view} busy={busy} act={act}/><Earn {...props} /></>}
      {tab === 'auctions' && <Auctions {...props} />}
      {tab === 'storage' && <Storage {...props} onOpening={onOpening} />}
      {tab === 'chat' && <Chat {...props} />}
      {confirmation && (
        <Modal
          title={confirmation.title}
          subtitle="Review the exact action · committed by the server"
          onClose={() => !busy && setConfirmation(null)}
        >
          <div className="mb-5 text-xs leading-7 text-[#b6a0c7]">{confirmation.description}</div>
          {error && (
            <p role="alert" className="mb-4 text-xs leading-6 text-rose-300">
              {error}
            </p>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              const result = await act(confirmation.command)
              if (result) setConfirmation(null)
            }}
          >
            <label className="mb-5 flex items-start gap-3 text-[11px] leading-6 text-[#b5a1c6]">
              <input required type="checkbox" className="mt-1.5 accent-[#b29ae8]" />I have reviewed
              the cost, lock, and final terms.
            </label>
            <Button disabled={busy} type="submit" className="w-full">
              {busy ? 'Committing…' : 'Confirm action'}
            </Button>
          </form>
        </Modal>
      )}
    </>
  )
}
function Grading({ view, busy, confirm, inspect }: Props) {
  const r = expansionRules(view.rules)
  const browser = useCardBrowser(view.cards.filter(
    (c) => c.status === 'owned' && c.attributes.grade == null && !c.gradedAt,
  ), 'grading cards')
  const cards = browser.cards
  return (
    <>
      <Heading
        eyebrow="THE VAULT GRADING DESK"
        title="Every detail makes a difference."
        text="Give an ungraded card its one and only assessment. The server rolls a grade from 1 to 10; the outcome is permanent."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Count
          value={`${r.gradingFeeBps / 100}% of TV`}
          label={`Grading fee · minimum ${r.gradingMinimum} credits`}
        />
        <Count value="1–10" label="Equal 10% chance for each grade" />
        <Count value={cards.length} label="Available ungraded cards" />
      </div>
      <Safety>
        Grade 7 is neutral. Grades 1–6 lower value; grades 8–10 increase it. Grading is not
        affiliated with a third-party grading company. Existing grades cannot be rerolled. Opening
        snapshots and prior transaction amounts never change.
      </Safety>
      {browser.controls}
      {cards.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => {
            const fee = gradingFee(c.snapshot.tv, view.rules)
            return (
              <div key={c.id} className="space-y-3">
                <CardTile card={c} onClick={() => inspect(c)} />
                <div className="rounded-xl border border-white/8 p-4">
                  <p className="mb-3 flex justify-between text-[10px] text-[#a48ab6]">
                    <span>One-time assessment</span>
                    <Credits value={fee} />
                  </p>
                  <Button
                    className="w-full"
                    disabled={busy || view.player.balance < fee}
                    onClick={() =>
                      confirm(
                        `Grade ${c.name}`,
                        <>
                          <p>
                            Card ID: <span className="break-all font-mono">{c.id}</span>
                          </p>
                          <p>
                            Fee: {fmt(fee)} credits. Current TV: {fmt(c.snapshot.tv)}.
                          </p>
                          <p className="mt-3 text-amber-200">
                            A low grade can permanently reduce this card’s True Value. There are no
                            refunds or rerolls.
                          </p>
                        </>,
                        { action: 'grade', card: c.id, expectedFee: fee, confirm: true },
                      )
                    }
                  >
                    Grade card · {fmt(fee)}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty icon="shield" title="No ungraded cards at the desk.">
          Only available, ungraded cards can be assessed.{' '}
          <Link href="/packs" className="text-[#c4a6ec] underline">
            Open a pack
          </Link>{' '}
          or withdraw a locked card first.
        </Empty>
      )}
      {!!view.expansion?.grades.length && (
        <section className={`${panel} mt-7`}>
          <h2 className="mb-5 font-display text-xl">Your grading receipts</h2>
          <div className="space-y-3">
            {view.expansion.grades.map((g) => (
              <details key={g.id} className="rounded-lg border border-white/8 p-4 text-xs">
                <summary className="cursor-pointer">
                  Grade {g.after.inputs.grade}/10{' '}
                  <span className="ml-3 text-[#90769e]">
                    {fmt(g.before.tv)} → {fmt(g.after.tv)} TV · fee {fmt(g.fee)}
                  </span>
                </summary>
                <p className="mt-3 break-all font-mono text-[10px] leading-6 text-[#a18aac]">
                  {g.card}
                  <br />
                  {new Date(g.at).toLocaleString()} · formula {g.after.version}
                  <br />
                  Receipt {g.id}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
function DisplayRoom({ view, now, busy, confirm, inspect }: Props) {
  const r = expansionRules(view.rules),
    displays = view.expansion?.displays ?? []
  const own = displays.find((d) => d.player === view.player.id)
  const browser = useCardBrowser(view.cards.filter(c=>c.status==='owned'), 'display cards')
  const gallery = useCardBrowser(displays.filter(d=>d.player!==view.player.id).map(d=>d.cardData), 'community exhibits')
  const cycles = own ? Math.max(0, Math.floor((now - own.paidThrough) / own.intervalMs)) : 0
  return (
    <>
      <Heading
        eyebrow="A COLLECTION WORTH SHOWING"
        title="Put your best find in the spotlight."
        text={`Display one card to earn 1/${r.displayDivisor} of its True Value every ${r.displaySeconds / 60} minutes. Your card stays yours, and the clock is kept by the server.`}
      >
        <Tag tone="amber">ONE DISPLAY SLOT PER COLLECTOR</Tag>
      </Heading>
      {own ? (
        <section className="mb-7 grid gap-7 rounded-2xl border border-[#c3a0ee]/25 bg-linear-to-br from-[#2c203a] to-[#17151e] p-6 md:grid-cols-[230px_1fr] sm:p-8">
          <CardTile card={own.cardData} onClick={() => inspect(own.cardData)} />
          <div className="flex flex-col justify-center">
            <Tag className="w-fit">YOUR CURRENT EXHIBIT</Tag>
            <h2 className="mt-5 font-display text-3xl">{own.cardData.name}</h2>
            <p className="mt-2 text-xs text-[#a98bbd]">
              {own.cardData.attributes.rarity} · {own.cardData.attributes.quality}
            </p>
            <div className="my-6 grid grid-cols-2 gap-3">
              <Count
                value={<Credits value={own.payout} />}
                label={`Per ${own.intervalMs / 60000}-minute interval`}
              />
              <Count value={<Credits value={cycles * own.payout} />} label="Available to collect" />
            </div>
            <p className="mb-5 text-xs text-[#a28bb3]">
              Next full interval in{' '}
              <span className="font-mono text-[#deccf0]">
                {remaining(own.paidThrough + (cycles + 1) * own.intervalMs, now)}
              </span>{' '}
              · {fmt(own.earned)} collected this session.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || !cycles}
                onClick={() =>
                  confirm(
                    'Collect display income',
                    `${cycles} completed intervals × ${fmt(own.payout)} credits. The server rechecks elapsed time; no interval can be paid twice.`,
                    { action: 'claimDisplay' },
                  )
                }
              >
                Collect income
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  confirm(
                    'Withdraw your display card',
                    'Full completed intervals will be paid once. Your card returns to available inventory; any unfinished interval is discarded.',
                    { action: 'withdrawDisplay' },
                  )
                }
              >
                Withdraw card
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <Safety>
            Your displayed card is locked against sales, trades, grading, and auctions. Payout and
            interval are fixed at placement; income accrues across sessions, and only completed
            intervals pay. Switching cards restarts the clock. At the default rate, continuous
            display earns {fmt(86400/r.displaySeconds/r.displayDivisor)}× the card’s reference TV per 24 hours.
          </Safety>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-xl">Choose your exhibit</h2>
            <Link href="/collection" className="text-xs text-[#bfa0e7]">
              View collection
            </Link>
          </div>
          {browser.controls}
          {browser.cards.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {browser.cards
                .map((c) => (
                  <div key={c.id} className="space-y-3">
                    <CardTile card={c} onClick={() => inspect(c)} />
                    <Button
                      className="w-full"
                      disabled={busy || Math.floor(c.snapshot.tv / r.displayDivisor) < 1}
                      onClick={() =>
                        confirm(
                          `Display ${c.name}`,
                          <>
                            This card will earn {fmt(Math.floor(c.snapshot.tv / r.displayDivisor))}{' '}
                            credits per {r.displaySeconds / 60} minutes, starting from placement. It
                            cannot be sold, traded, graded, or auctioned until withdrawn.
                          </>,
                          { action: 'display', card: c.id, confirm: true },
                        )
                      }
                    >
                      Display · {fmt(Math.floor(c.snapshot.tv / r.displayDivisor))} / interval
                    </Button>
                  </div>
                ))}
            </div>
          ) : (
            <Empty title="A spotlight waiting for your first card.">
              <Link href="/packs" className="text-[#bfa0e7]">
                Visit the pack shop to start collecting.
              </Link>
            </Empty>
          )}
        </>
      )}
      <section className="mt-8">
        <h2 className="mb-5 font-display text-xl">The community gallery</h2>
        {gallery.controls}
        {displays.filter((d) => d.player !== view.player.id).length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {displays
              .filter((d) => d.player !== view.player.id && gallery.cards.some(c=>c.id===d.cardData.id))
              .map((d) => (
                <div key={d.player} className={panel}>
                  <p className="mb-4 text-xs text-[#c0a6d5]">{d.name}’s exhibit</p>
                  <CardTile card={d.cardData} onClick={() => inspect(d.cardData)} />
                  <p className="mt-4 text-[10px] text-[#9b83ad]">
                    {fmt(d.payout)} credits / interval · Display locked
                  </p>
                </div>
              ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-xs text-[#8f7a9f]">
            No other collectors are exhibiting yet.
          </p>
        )}
      </section>
    </>
  )
}
function Earn({ view, now, busy, act }: Props) {
  const r = expansionRules(view.rules),
    [checked, setChecked] = useState(false)
  const job = view.expansion?.jobs
  const today = new Date(now).toISOString().slice(0, 10),
    count = job?.day === today ? job.count : 0
  const wait = Math.max(0, (job?.lastAt ?? 0) + r.jobCooldownSeconds * 1000 - now)
  return (
    <>
      <Heading
        eyebrow="SMALL TASKS. STEADY PROGRESS."
        title="Make a little room for more."
        text="You don’t need a lucky spin to grow your wallet. Pick up a collection job, claim your daily grant, or let your display earn over time."
      />
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className={panel}>
          <Tag tone="emerald">COLLECTION JOB</Tag>
          <h2 className="mt-5 font-display text-2xl">The catalogue needs a sharp eye.</h2>
          <p className="mt-3 text-xs leading-7 text-[#9c85ac]">
            Check the reference tray before signing off: rarity describes scarcity; quality
            describes condition. A torn card can still be rare, and an ungraded card has a neutral
            grade modifier.
          </p>
          <div className="my-6 grid grid-cols-3 gap-3">
            {[
              ['Rarity', 'Rare'],
              ['Quality', 'Torn'],
              ['Grade', 'Not rolled'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[9px] text-[#7e6a91]">{label}</p>
                <p className="mt-2 text-xs text-[#d1b8e6]">{value}</p>
              </div>
            ))}
          </div>
          <label className="my-6 flex items-start gap-3 text-xs leading-6 text-[#b6a0c6]">
            <input
              className="mt-1 accent-[#bba0ef]"
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            I checked the tray: rarity, quality, and grade are separate attributes.
          </label>
          <Button
            disabled={busy || !checked || wait > 0 || count >= r.jobDailyLimit}
            onClick={async () => {
              if (await act({ action: 'job', task: 'catalog', confirm: true })) setChecked(false)
            }}
          >
            {count >= r.jobDailyLimit
              ? 'All jobs complete today'
              : wait
                ? `Next tray in ${remaining(now + wait, now)}`
                : `Complete job · +${jobBaseReward(view.rules)} credits`}
          </Button>
          <p className="mt-4 text-[10px] leading-6 text-[#887098]">
            {count} / {r.jobDailyLimit} jobs today · {r.jobCooldownSeconds}s cooldown · resets 00:00
            UTC. Jobs use saved server limits, not your browser clock.
          </p>
        </section>
        <div className="space-y-5">
          <section className={panel}>
            <div className="mb-4 flex items-center gap-3">
              <Icon name="coin" className="text-[#d6bb83]" />
              <h2 className="font-display text-xl">Your daily drop</h2>
            </div>
            <p className="mb-5 text-xs leading-6 text-[#9880aa]">
              {dailyBaseReward(view.rules)} free credits plus streak bonuses, once each UTC day. No cost, no random
              outcome.
            </p>
            <Button
              variant="secondary"
              disabled={busy || view.player.lastDaily === today}
              onClick={() => void act({ action: 'daily' })}
            >
              {view.player.lastDaily === today ? 'Daily grant claimed' : 'Claim daily grant'}
            </Button>
          </section>
          <section className={panel}>
            <Icon name="display" className="mb-4 text-[#bda1e5]" />
            <h2 className="font-display text-xl">Let your collection work.</h2>
            <p className="my-4 text-xs leading-6 text-[#9880aa]">
              Exhibit a card for recurring income, or choose your own asking price on the player
              market.
            </p>
            <div className="flex flex-wrap gap-4 text-xs text-[#bfa0e7]">
              <Link href="/display">Card Display →</Link>
              <Link href="/market">Player Market →</Link>
              <Link href="/slots">Lucky Slots →</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
function Auctions(props: Props) {
  const { view, busy, confirm, now } = props
  const [filter, setFilter] = useState('Live auctions'),
    [create, setCreate] = useState(false)
  const [card, setCard] = useState(''),
    [price, setPrice] = useState(50),
    [seconds, setSeconds] = useState(300)
  const r = expansionRules(view.rules)
  const listingBrowser = useCardBrowser((view.expansion?.auctions??[]).filter(a=>a.kind==='card'&&a.cardData).map(a=>a.cardData!), 'auction listings')
  const inventoryBrowser = useCardBrowser(view.cards.filter(c=>c.status==='owned'), 'auction inventory')
  const available = inventoryBrowser.cards
  const recentSale = view.expansion?.auctions.find(
    (a) =>
      a.kind === 'card' &&
      listingBrowser.cards.some(c=>c.id===a.card) &&
      a.status === 'sold' &&
      (a.seller === view.player.id || a.bids.at(-1)?.bidder === view.player.id),
  )
  const auctions = (view.expansion?.auctions ?? []).filter(
    (a) =>
      a.kind === 'card' &&
      (filter === 'Live auctions'
        ? a.status === 'active'
        : filter === 'My auctions'
          ? a.seller === view.player.id
          : a.status !== 'active'),
  )
  return (
    <>
      <Heading
        eyebrow="THE PLAYER AUCTION HOUSE"
        title="A rare find. An open bidding floor."
        text="Player-owned cards. Player-only bids. Set a starting price, reserve your bid, and let the room decide the final sale price."
      >
        <Button onClick={() => setCreate(true)}>
          <Icon name="plus" size={16} />
          Auction a card
        </Button>
      </Heading>
      {recentSale && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300/15 bg-emerald-300/4 p-5">
          <div>
            <p className="text-xs text-emerald-200">Most recent settlement · {recentSale.title}</p>
            <p className="mt-2 text-[10px] text-[#8baf9e]">
              Final bid {fmt(recentSale.bids.at(-1)!.amount)} credits.{' '}
              {recentSale.seller === view.player.id
                ? 'Sale proceeds were credited after the disclosed seller fee.'
                : 'Your winning card is now in your collection.'}
            </p>
          </div>
          <Link
            href={recentSale.seller === view.player.id ? '/settings' : '/collection'}
            className="text-xs text-emerald-200 underline"
          >
            {recentSale.seller === view.player.id ? 'View account' : 'View winning card'}
          </Link>
        </div>
      )}
      <div className="mb-6 flex flex-wrap gap-2">
        {['Live auctions', 'My auctions', 'History'].map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'primary' : 'ghost'}
            onClick={() => setFilter(value)}
          >
            {value}
          </Button>
        ))}
        <Link href="/market" className="ml-auto self-center text-[11px] text-[#bda0df]">
          Prefer a fixed price? Player Market →
        </Link>
      </div>
      <Safety>
        Cards and highest bids are locked in escrow. Outbid credits return atomically. Sellers pay
        the disclosed sale fee; PMV is only an estimate. A late player bid extends the deadline by
        up to {r.softCloseSeconds}s, with at most {r.maximumExtensions} extensions. NPCs never bid
        here. You cannot cancel after the first bid.
      </Safety>
      {listingBrowser.controls}
      {auctions.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {auctions.map((a) => (
            <AuctionPanel key={a.id} auction={a} {...props} />
          ))}
        </div>
      ) : (
        <Empty icon="auction" title="The floor is open. The first bid is yours.">
          No auctions match this view. List an available card or check back when another collector
          lists one.
        </Empty>
      )}
      {create && (
        <Modal
          title="List a player card auction"
          subtitle="No NPC bids · cards remain locked until settlement"
          onClose={() => setCreate(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const selected = view.cards.find((c) => c.id === card)
              if (!selected) return
              setCreate(false)
              confirm(
                `Auction ${selected.name}`,
                <>
                  <p>
                    Starting bid: {fmt(price)} credits · duration: {seconds}s.
                  </p>
                  <p>
                    Seller fee: {view.rules.fee * 100}% of the final winning bid. No bid means no
                    fee.
                  </p>
                  <p>
                    The card is locked. You may cancel only before any bid. A qualifying late bid
                    can extend the deadline.
                  </p>
                </>,
                { action: 'createAuction', card, startingBid: price, seconds, confirm: true },
              )
            }}
          >
            {inventoryBrowser.controls}
            <Field label="Your available card">
              <select
                required
                className={input}
                value={card}
                onChange={(event) => setCard(event.target.value)}
              >
                <option value="">Choose a card</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.attributes.rarity} · {fmt(c.snapshot.tv)} TV · {c.id.slice(0, 6)}
                  </option>
                ))}
              </select>
            </Field>
            {!available.length && (
              <p className="mb-4 text-xs text-amber-200">
                No available cards. Withdraw a displayed card, cancel another listing, or open a
                pack first.
              </p>
            )}
            <Field label="Starting bid · credits">
              <input
                required
                type="number"
                min={1}
                max={1e12}
                step={1}
                className={input}
                value={price}
                onChange={(event) => setPrice(Number(event.target.value))}
              />
            </Field>
            <Field label="Auction duration">
              <select
                className={input}
                value={seconds}
                onChange={(event) => setSeconds(Number(event.target.value))}
              >
                {[30, 120, 300, 3600, 86400]
                  .filter((s) => s >= r.auctionMinimumSeconds && s <= r.auctionMaximumSeconds)
                  .map((s) => (
                    <option key={s} value={s}>
                      {s < 60
                        ? `${s} seconds`
                        : s < 3600
                          ? `${s / 60} minutes`
                          : `${s / 3600} hours`}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="mb-4 text-[10px] leading-6 text-[#8f78a0]">
              The server starts timing when you confirm. Current server time:{' '}
              {new Date(now).toLocaleTimeString()}.
            </p>
            <Button disabled={busy || !available.length} type="submit" className="w-full">
              Review auction
            </Button>
          </form>
        </Modal>
      )}
    </>
  )
}
function AuctionPanel({
  auction: a,
  view,
  now,
  busy,
  confirm,
  inspect,
}: Props & { auction: AuctionView }) {
  const high = a.bids.at(-1),
    live = a.status === 'active',
    lobby = now < a.startsAt
  const [bid, setBid] = useState(a.minimumBid)
  const isMember = a.kind === 'card' || a.seats?.some((s) => s.id === view.player.id)
  const card = a.cardData,
    pmv = card ? marketValue(card.attributes, card.snapshot.tv, view.sales).value : 0
  return (
    <article className={`${panel} min-w-0`} data-auction-id={a.id}>
      {a.kind==='storage'&&a.npcBudgetCap!=null&&<p className="mb-4 text-[10px] text-[#c2ab85]">NPC hard ceiling: {fmt(a.npcBudgetCap)} credits per bidder · no budget refills</p>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tag tone={live ? 'emerald' : 'violet'}>
          {live ? (lobby ? 'LOBBY OPEN' : 'LIVE BIDDING') : a.status.toUpperCase()}
        </Tag>
        <span className="font-mono text-xs text-[#c4afe0]">
          {live ? remaining(lobby ? a.startsAt : a.endsAt, now) : 'SETTLED'}{' '}
          <span className="text-[8px] text-[#776687]">
            {live ? (lobby ? 'UNTIL START' : 'REMAINING') : ''}
          </span>
        </span>
      </div>
      {card ? (
        <div className="mb-5 grid grid-cols-[86px_1fr] gap-4">
          <button
            onClick={() => inspect(card)}
            aria-label={`Inspect auction card ${card.name}`}
            className="flex min-h-30 flex-col items-center justify-center rounded-xl border border-[#b391df]/30 bg-[#b391df]/6 p-3 text-center"
          >
            <Icon name="diamond" className="mb-3 text-[#c2a4ec]" />
            <span className="text-[9px] text-[#c4adde]">{card.attributes.rarity}</span>
          </button>
          <div className="min-w-0">
            <h2 className="font-display text-xl">{a.title}</h2>
            <p className="mt-2 text-[10px] text-[#927a9f]">
              Seller: {a.sellerName} · {card.attributes.quality}
            </p>
            <p className="mt-3 text-[10px] text-[#bca3d0]">
              TV {fmt(card.snapshot.tv)} · PMV ≈ {fmt(pmv)}
            </p>
            <p className="mt-2 break-all font-mono text-[8px] text-[#74627f]">{card.id}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-4 rounded-xl border border-[#bc9f72]/15 bg-[#bc9f72]/4 p-5">
            <Icon name="storage" size={40} className="shrink-0 text-[#c2ab85]" />
            <div>
              <h2 className="font-display text-xl">{a.title}</h2>
              <p className="mt-2 text-[10px] leading-5 text-[#9a876f]">
                Sealed crates, an old ledger, and a covered card cabinet. Contents unknown; rewards
                may be worth less than your bid.
              </p>
            </div>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {a.seats?.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-2 rounded-lg border p-3 text-[10px] ${s.id === view.player.id ? 'border-[#ba9ae7]/30 bg-[#ba9ae7]/8 text-[#d3b9ed]' : 'border-white/6 text-[#9a849f]'}`}
              >
                <Icon name={s.npc ? 'npc' : 'users'} size={15} />
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="ml-auto text-[8px] opacity-60">{s.npc ? 'NPC' : 'PLAYER'}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Count
          value={<Credits value={high?.amount ?? a.startingBid} />}
          label={high ? 'Highest bid · reserved' : 'Starting bid'}
        />
        <Count value={a.highestBidderName ?? 'Be the first'} label="Highest bidder" />
      </div>
      {live && isMember && a.seller !== view.player.id && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            confirm(
              `Bid on ${a.title}`,
              <>
                <p>
                  Reserve exactly {fmt(bid)} credits on auction {a.id.slice(0, 8)}.
                </p>
                <p>
                  Current minimum: {fmt(a.minimumBid)}. If another bid arrives first, the server may
                  reject this bid without charging you.
                </p>
                <p>
                  {a.kind === 'storage'
                    ? 'This is a mystery unit. Contents are not guaranteed to cover your bid. NPCs are clearly labeled and bid only within their server-set budgets.'
                    : 'The winning bid buys the exact card shown. The seller pays the disclosed fee.'}
                </p>
                <p className="mt-3 text-amber-200">
                  A winning bid is final. Credits return only if you are outbid.
                </p>
              </>,
              { action: 'bid', auction: a.id, amount: bid, confirm: true },
            )
          }}
        >
          <label className="mb-2 block text-[10px] text-[#8f799f]" htmlFor={`bid-${a.id}`}>
            Your bid · minimum {fmt(a.minimumBid)}
          </label>
          <div className="flex gap-2">
            <input
              id={`bid-${a.id}`}
              required
              className={`${input} min-w-0 flex-1`}
              type="number"
              min={a.minimumBid}
              max={1e12}
              step={1}
              value={bid}
              onChange={(event) => setBid(Number(event.target.value))}
            />
            <Button
              type="submit"
              disabled={
                busy ||
                lobby ||
                now >= a.endsAt ||
                bid < a.minimumBid ||
                bid > view.player.balance + (high?.bidder === view.player.id ? high.amount : 0)
              }
            >
              Review bid
            </Button>
          </div>
          <button
            type="button"
            className="mt-2 text-[10px] text-[#b89bcf] underline"
            onClick={() => setBid(a.minimumBid)}
          >
            Use current minimum
          </button>
          {high?.bidder === view.player.id && (
            <p className="mt-2 text-[10px] text-[#83c6ad]">
              You are leading. Your existing reserved bid counts toward a raise.
            </p>
          )}
        </form>
      )}
      {live && a.kind === 'storage' && !isMember && (
        <Button
          className="w-full"
          disabled={busy || !lobby || !a.seats?.some((s) => s.npc)}
          onClick={() =>
            confirm(
              'Take a storage auction seat',
              'You replace one NPC before the lobby closes. Joining is free; credits are reserved only when you bid. You cannot join another room while this room is live.',
              { action: 'joinStorage', auction: a.id },
            )
          }
        >
          {lobby ? 'Join room · replace an NPC' : 'Spectating · bidding already started'}
        </Button>
      )}
      {live && a.seller === view.player.id && (
        <Button
          variant="secondary"
          disabled={busy || !!high}
          onClick={() =>
            confirm(
              'Cancel your card auction',
              'No bids have been placed. Your card will return to available inventory.',
              { action: 'cancelAuction', auction: a.id },
            )
          }
        >
          {high ? 'Bids placed · cancellation locked' : 'Cancel auction'}
        </Button>
      )}
      {!live && a.prize && (
        <div className="mt-5 rounded-xl border border-[#82ba9d]/25 bg-[#82ba9d]/5 p-4">
          <p className="mb-3 text-xs text-[#a3d3bc]">Your unit has been unsealed.</p>
          <p className="text-[11px] leading-6 text-[#a4b6aa]">
            {fmt(a.prize.cash)} credits credited · {a.prize.cards.length} cards delivered ·{' '}
            {a.prize.packs.length} unopened packs awarded.
          </p>
          <Link
            href="/collection"
            className="mt-3 inline-block text-[10px] text-[#b8d8c6] underline"
          >
            Inspect your awarded cards
          </Link>
        </div>
      )}
      <details className="mt-5 border-t border-white/6 pt-4">
        <summary className="cursor-pointer text-[10px] text-[#9580a4]">
          Bid history · {a.bids.length} recent bids · {a.extensions} extensions
        </summary>
        <div className="mt-3 max-h-40 space-y-2 overflow-auto">
          {a.bids.length ? (
            [...a.bids].reverse().map((b, i) => (
              <p
                key={`${b.at}-${i}`}
                className="flex justify-between gap-3 text-[9px] text-[#a28aaf]"
              >
                <span>
                  {b.npc
                    ? `${a.seats?.find((s) => s.id === b.bidder)?.name ?? 'NPC'} · NPC`
                    : (view.players.find((p) => p.id === b.bidder)?.name ?? 'Collector')}
                </span>
                <span>
                  {fmt(b.amount)} · {new Date(b.at).toLocaleTimeString()}
                </span>
              </p>
            ))
          ) : (
            <p className="text-[10px] text-[#796888]">No bids yet.</p>
          )}
        </div>
      </details>
    </article>
  )
}
function Storage(props: Props & { onOpening: (cards: Card[], pack: string) => void }) {
  const { view, busy, confirm, act, onOpening } = props,
    r = expansionRules(view.rules)
  const rooms = (view.expansion?.auctions ?? []).filter((a) => a.kind === 'storage')
  const [showHistory, setShowHistory] = useState(false)
  const [tierId, setTierId] = useState('salvage'), [search, setSearch] = useState('')
  const tier = storageTiers.find(t=>t.id===tierId)!
  const progress = view.progression?.advancement
  const rewards = view.expansion?.packs.filter((p) => !p.opened) ?? []
  const current = rooms.find(
    (a) => a.status === 'active' && a.seats?.some((s) => s.id === view.player.id),
  )
  const latestWin = rooms.find((room) => room.status === 'sold' && room.prize)
  return (
    <>
      <Heading
        eyebrow="THE MYSTERY STORAGE ROOMS"
        title="What’s behind the shutter?"
        text="Four seats. One sealed storage unit. Replace an NPC, watch the bids come in, and decide what the unknown is worth. Separate from player card auctions."
      >
        <Button
          disabled={busy || !!current}
          onClick={() =>
            confirm(
              'Open a new storage room',
              `Joining is free. You take one of four seats, replacing an NPC. The lobby lasts ${r.storageLobbySeconds}s, then bidding lasts ${r.storageBiddingSeconds}s before any extensions. No bid means no cost.`,
              { action: 'createStorage', tier: tierId },
            )
          }
        >
          <Icon name="storage" size={16} />
          {current ? 'You have a live seat' : 'Open room & take a seat'}
        </Button>
      </Heading>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">{storageTiers.map(t=><button key={t.id} disabled={busy||!!current||(progress?.level??1)<t.level||(progress?.peakWorth??0)<t.worth} aria-pressed={tierId===t.id} onClick={()=>setTierId(t.id)} className={`rounded-xl border p-4 text-left disabled:opacity-40 ${tierId===t.id?'border-[#cfb585]/40 bg-[#cfb585]/10':'border-white/10'}`}><p className="text-sm text-[#d2bb96]">{t.name}</p><p className="mt-2 text-[10px] leading-6 text-[#9e8a72]">Lv {t.level} · {fmt(t.worth)} peak worth<br/>{t.multiplier}× starting bids & cash</p></button>)}</div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Count value="4" label="Seats · each joining player replaces an NPC" />
        <Count
          value={<Credits value={r.storageStartingBid*tier.multiplier} />}
          label="Starting bid · joining is free"
        />
        <Count value="12 live rooms" label="2.5-second sync · server-owned deadlines" />
      </div>
      <Safety>
        Possible contents: 0–{r.storageMaximumCards} standard cards, 0–{r.storageMaximumPacks}{' '}
        unopened standard packs, and at least {r.storageStartingBid*2*tier.multiplier} cash credits (up to {Math.max(r.storageStartingBid*2,r.storageMaximumCash)*tier.multiplier}). Cards and packs
        use the eligible unlimited standard catalog; Limited is excluded. Each NPC has a fixed budget
        capped at 85% of the sealed reference value (cash + card TV + pack prices), never infinite.
        A bid above every NPC budget cannot be countered by an NPC. Winning profit is not guaranteed;
        other humans can still outbid you. Contents and individual budgets stay sealed server-side.
        Players must join during the lobby; all four seats can be taken by humans.
      </Safety>
      {latestWin?.prize && (
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-5">
          <div>
            <h2 className="font-display text-xl">Your latest unit is unsealed.</h2>
            <p className="mt-3 text-xs leading-6 text-[#9bc2ae]">
              {latestWin.title}: {fmt(latestWin.prize.cash)} credits credited,{' '}
              {latestWin.prize.cards.length} cards delivered, and {latestWin.prize.packs.length}{' '}
              unopened packs awarded.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setShowHistory(true)}>
            Review your delivered unit
          </Button>
        </section>
      )}
      {!!rewards.length && (
        <section className={`${panel} mb-6`}>
          <h2 className="mb-4 font-display text-xl">Unopened packs from your units</h2>
          <div className="flex flex-wrap gap-3">
            {rewards.map((p) => (
              <Button
                key={p.id}
                disabled={busy}
                variant="secondary"
                onClick={async () => {
                  const result = await act({ action: 'openRewardPack', reward: p.id })
                  if (result?.cards) onOpening(result.cards, p.pack.name)
                }}
              >
                Open awarded {p.pack.name}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-[#8b759b]">
            No opening charge. Each entitlement is consumed atomically and can only be opened once.
            Odds use the saved standard-pack definition awarded by the unit.
          </p>
        </section>
      )}
      <div className="mb-5 flex gap-2">
        <Button variant={!showHistory ? 'primary' : 'ghost'} onClick={() => setShowHistory(false)}>
          Live rooms
        </Button>
        <Button variant={showHistory ? 'primary' : 'ghost'} onClick={() => setShowHistory(true)}>
          Your past rooms
        </Button>
        <Link href="/auctions" className="ml-auto self-center text-[11px] text-[#bda0df]">
          Player card auctions →
        </Link>
      </div>
      <input aria-label="Search storage auctions" className={`${input} mb-5`} placeholder="Search unit, district or auction ID…" value={search} onChange={e=>setSearch(e.target.value)}/>
      {rooms.some((a) => (showHistory ? a.status !== 'active' : a.status === 'active')) ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {rooms
            .filter((a) => (showHistory ? a.status !== 'active' : a.status === 'active') && `${a.title} ${a.id}`.toLowerCase().includes(search.toLowerCase()))
            .map((a) => (
              <AuctionPanel key={a.id} auction={a} {...props} />
            ))}
        </div>
      ) : (
        <Empty
          icon="storage"
          title={showHistory ? 'No storage stories yet.' : 'The next shutter is waiting.'}
        >
          {showHistory
            ? 'Your completed rooms and delivered contents will appear here.'
            : 'Open a room to replace the first NPC, or return when another collector opens a lobby.'}
        </Empty>
      )}
    </>
  )
}
function Chat({ view, act, busy, confirm }: Props) {
  const [body, setBody] = useState(''),
    [muted, setMuted] = useState<string[]>([])
  const messages = view.expansion?.messages ?? [],
    r = expansionRules(view.rules)
  return (
    <>
      <Heading
        eyebrow="THE COLLECTOR LOUNGE"
        title="Good collections start conversations."
        text="A persistent, global room for registered collectors. Talk finds, discuss a fair price, or find someone to trade with. Never share passwords, email addresses, or private information."
      >
        <Tag tone="emerald">LIVE · ~1 SECOND REFRESH</Tag>
      </Heading>
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <section className={`${panel} min-w-0`}>
          <div className="mb-5 flex items-center gap-3 border-b border-white/8 pb-4">
            <Icon name="chat" size={18} className="text-[#b99bdd]" />
            <h2 className="text-sm font-medium"># global-collectors</h2>
            <span className="ml-auto text-[9px] text-[#776386]">Most recent 100 messages</span>
          </div>
          <div
            className="max-h-120 min-h-65 space-y-5 overflow-y-auto pr-2"
            aria-label="Global messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.filter((m) => !muted.includes(m.player)).length ? (
              messages
                .filter((m) => !muted.includes(m.player))
                .map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl p-3 ${m.player === view.player.id ? 'border border-[#b695dd]/15 bg-[#b695dd]/5' : 'bg-white/2'}`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-[#c4a8da]">{m.name}</span>
                      {m.player === view.player.id && (
                        <span className="text-[8px] text-[#82708c]">YOU</span>
                      )}
                      <time className="text-[9px] text-[#706079]">
                        {new Date(m.at).toLocaleTimeString()}
                      </time>
                      {m.player !== view.player.id && (
                        <div className="ml-auto flex gap-3 text-[9px] text-[#807087]">
                          <button onClick={() => setMuted((ids) => [...ids, m.player])}>
                            Mute
                          </button>
                          <button
                            onClick={() =>
                              confirm(
                                'Report this message',
                                'Reports are recorded against your authenticated account. Three distinct reports hide a message pending operator review.',
                                { action: 'reportChat', message: m.id },
                              )
                            }
                          >
                            Report
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs leading-6 text-[#b1a0bc]">
                      {m.body}
                    </p>
                  </div>
                ))
            ) : (
              <div className="flex min-h-60 flex-col items-center justify-center text-center text-[#867092]">
                <Icon name="chat" size={32} />
                <p className="mt-4 text-xs">You’re early. Say hello to the room.</p>
              </div>
            )}
          </div>
          <form
            className="mt-5 border-t border-white/8 pt-5"
            onSubmit={async (event) => {
              event.preventDefault()
              if (await act({ action: 'chat', body })) setBody('')
            }}
          >
            <label htmlFor="chat-message" className="mb-2 block text-[10px] text-[#a28bb3]">
              Your message
            </label>
            <textarea
              id="chat-message"
              required
              maxLength={280}
              rows={2}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Share a find, not private information…"
              className={`${input} resize-y`}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[9px] text-[#796589]">
                {body.length}/280 · {r.chatCooldownSeconds}s server cooldown
              </span>
              <Button disabled={busy || !body.trim()} type="submit">
                <Icon name="arrow" size={14} />
                Send message
              </Button>
            </div>
          </form>
        </section>
        <aside className="space-y-5">
          <section className={panel}>
            <h2 className="mb-4 font-display text-lg">Keep the lounge welcoming.</h2>
            <p className="text-[11px] leading-7 text-[#96809f]">
              No harassment, spam, scams, or real-money trading. Messages are plain text and saved
              on the server. Three distinct reports temporarily hide a message; an operator can
              review the audit history.
            </p>
            {!!muted.length && (
              <button
                className="mt-5 text-[10px] text-[#bda0df] underline"
                onClick={() => setMuted([])}
              >
                Clear your {muted.length} local mutes
              </button>
            )}
          </section>
          <section className={panel}>
            <p className="mb-4 text-[10px] tracking-wider text-[#8b759a]">MAKE YOUR NEXT MOVE</p>
            <div className="space-y-4 text-xs text-[#bda0df]">
              <Link className="block" href="/trades">
                Find a fair exchange →
              </Link>
              <Link className="block" href="/market">
                Browse fixed-price listings →
              </Link>
              <Link className="block" href="/auctions">
                Visit the bidding floor →
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
