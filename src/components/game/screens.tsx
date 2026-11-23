'use client'
import { dailyBaseReward, slotConfiguration, slotTiers } from '@/game/advancement'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from './icons'
import {
  Button,
  CardTile,
  Credits,
  Empty,
  Field,
  fmt,
  Modal,
  PackVisual,
  Tag,
  cardStatusLabel,
} from './ui'
import {
  marketValue,
  mutationDistribution,
  mutations,
  qualities,
  rarities,
  type Rules,
} from '@/game/rules'
import type { Card, CommandResult, GameCommand, GameView, Pack, Trade } from '@/game/types'
import { maxQuickSellCards } from '@/game/types'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-[#101016] px-3 py-2.5 text-xs text-[#d9d2e5] outline-none placeholder:text-[#655f72] focus:border-[#a28bf5]/60'
type Act = (command: Omit<GameCommand, 'key'>) => Promise<CommandResult | null>
function packUnavailable(pack: Pack) {
  if (pack.lockedReason) return 'Progression locked'
  if (pack.remainingStock === 0) return 'Sold out'
  if (pack.starts && Date.parse(pack.starts) > Date.now()) return 'Scheduled'
  if (pack.ends && Date.parse(pack.ends) <= Date.now()) return 'Release ended'
  return ''
}
function Title({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-[-.035em]">{title}</h1>
        <p className="mt-2 text-[11px] leading-5 text-[#8d849c]">{text}</p>
      </div>
      {children}
    </div>
  )
}
function Tabs({
  options,
  current,
  set,
}: {
  options: string[]
  current: string
  set: (v: string) => void
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-white/8">
      {options.map((x) => (
        <button
          key={x}
          onClick={() => set(x)}
          className={`relative px-4 pb-3 pt-2 text-[11px] transition ${current === x ? 'text-[#c0a9f5]' : 'text-[#81758f] hover:text-[#b4a5c5]'}`}
        >
          {x}
          {current === x && (
            <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-t bg-[#ac8eea]" />
          )}
        </button>
      ))}
    </div>
  )
}
export function Shop({
  view,
  onPack,
  onOdds,
  onHistory,
}: {
  view: GameView
  onPack: (p: Pack) => void
  onOdds: (p: Pack) => void
  onHistory: () => void
}) {
  const [tab, setTab] = useState('Standard packs')
  const [search, setSearch] = useState(''), [access, setAccess] = useState('all')
  const packs = view.packs.filter((p) => !!p.limited === (tab === 'Limited releases') &&
    `${p.name} ${p.subtitle}`.toLowerCase().includes(search.toLowerCase()) &&
    (access==='all'||(access==='unlocked'?!p.lockedReason:!!p.lockedReason)))
  return (
    <>
      <Title
        title="A small pack. A world of possibilities."
        text="Every card is one of a kind. Find out what’s waiting for you."
      >
        <Button variant="secondary" onClick={onHistory}>
          <Icon name="history" size={15} />
          Opening history
        </Button>
      </Title>
      <Tabs options={[`Standard packs`, 'Limited releases']} current={tab} set={setTab} />
      <div className="mb-5 flex flex-wrap gap-3"><input aria-label="Search packs" className={`${inputClass} sm:max-w-80`} placeholder="Search packs…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Pack progression filter" className={`${inputClass} sm:max-w-60`} value={access} onChange={e=>setAccess(e.target.value)}><option value="all">All unlock tiers</option><option value="unlocked">Unlocked packs</option><option value="locked">Progression locked</option></select></div>
      <div className="mb-5 flex items-center justify-between text-[10px] text-[#8c7f9d]">
        <p>
          {packs.length} {tab === 'Limited releases' ? 'active releases' : 'standard pack types'} ·
          12 standard rarities · no card art, all character
        </p>
        <span className="hidden sm:block">Outcomes generated securely on the server</span>
      </div>
      {packs.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {packs.map((pack) => (
            <article key={pack.id} className="rounded-xl border border-white/8 bg-[#18171f] p-5">
              {pack.lockedReason && <p className="mb-4 text-[10px] leading-6 text-[#d1b783]">Unlock: {pack.lockedReason}. Lucky rarity rolls are never reduced.</p>}
              <div className="flex items-center justify-between">
                <Tag tone={pack.color}>{pack.limited ? 'LIMITED RELEASE' : 'STANDARD SERIES'}</Tag>
                <span className="text-[9px] text-[#8a7b99]">{pack.count} cards per pack</span>
              </div>
              <PackVisual pack={pack} />
              <h2 className="font-display text-xl">{pack.name}</h2>
              <p className="mt-2 text-[11px] text-[#8f7fa2]">{pack.subtitle}</p>
              <div className="my-4 flex justify-between border-y border-white/6 py-3 text-[10px]">
                <span className="text-[#887a9b]">
                  {pack.limited
                    ? pack.stock
                      ? `${pack.remainingStock ?? pack.stock} / ${pack.stock} packs remaining`
                      : 'Time-limited release'
                    : 'Repeatable · no stock limit'}
                </span>
                <button
                  onClick={() => onOdds(pack)}
                  className="flex items-center gap-1 text-[#baa1ee]"
                >
                  View exact odds
                  <Icon name="info" size={12} />
                </button>
              </div>
              {pack.limited && (pack.starts || pack.ends) && (
                <p className="mb-4 text-[9px] leading-5 text-[#8e779f]">
                  {pack.starts
                    ? `Starts ${new Date(pack.starts).toLocaleString()}`
                    : 'Available now'}
                  {pack.ends ? ` · Ends ${new Date(pack.ends).toLocaleString()}` : ''}
                </p>
              )}
              <div className="flex items-center justify-between">
                <Credits value={pack.price} className="text-lg font-medium" />
                <Button disabled={!!packUnavailable(pack)} onClick={() => onPack(pack)}>
                  {packUnavailable(pack) || 'Open pack'}
                  <Icon name="arrow" size={14} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon="clock" title="The rarest things are worth waiting for.">
          There are zero active Limited crates. New releases will appear here only when an operator
          publishes them. Standard packs never roll Limited cards.
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setTab('Standard packs')}>
              Explore standard packs
            </Button>
          </div>
        </Empty>
      )}
      <div className="mt-6 flex gap-3 rounded-xl border border-[#b79ce1]/12 bg-[#a28bf5]/4 p-4">
        <Icon name="shield" size={19} className="shrink-0 text-[#a68cc9]" />
        <p className="text-[10px] leading-6 text-[#9a87ae]">
          Know your odds. Every opening is committed before the reveal, and animation never changes
          your outcome. Rarity and quality always roll; grades, mutations, and special effects are
          optional. All purchases use in-game credits only.
        </p>
      </div>
    </>
  )
}
export function Collection({
  view,
  onInspect,
  onSell,
  onSellDuplicates,
}: {
  view: GameView
  onInspect: (c: Card) => void
  onSell: (c: Card[]) => void
  onSellDuplicates: (quote: NonNullable<GameView['duplicateSale']>) => void
}) {
  const [query, setQuery] = useState(''),
    [rarity, setRarity] = useState('All rarities'),
    [quality, setQuality] = useState('All qualities'),
    [mutation, setMutation] = useState('All mutations'),
    [grade, setGrade] = useState('All grades'),
    [special, setSpecial] = useState('All effects'),
    [status, setStatus] = useState('All cards'),
    [source, setSource] = useState('All sources'),
    [sort, setSort] = useState('Newest first'),
    [grid, setGrid] = useState(true),
    [filters, setFilters] = useState(false),
    [selected, setSelected] = useState<string[]>([])
  const [visible, setVisible] = useState(60)
  useEffect(()=>setVisible(60),[query,rarity,quality,mutation,grade,special,status,source,sort])
  useEffect(() => {
    const available = new Set(view.cards.filter(c => c.status === 'owned').map(c => c.id))
    setSelected(previous => previous.every(id => available.has(id)) ? previous : previous.filter(id => available.has(id)))
  }, [view.cards])
  const results = view.cards
    .filter(
      (c) =>
        `${c.name} ${c.id} ${c.attributes.rarity} ${c.serial??''} ${c.visual?.mutationName??''} ${c.visual?.effectName??''}`.toLowerCase().includes(query.toLowerCase()) &&
        (rarity === 'All rarities' || c.attributes.rarity === rarity) &&
        (quality === 'All qualities' || c.attributes.quality === quality) &&
        (mutation === 'All mutations' ||
          (mutation === 'No Mutation'
            ? !c.attributes.mutation
            : c.attributes.mutation === mutation)) &&
        (grade === 'All grades' ||
          (grade === 'Not rolled' ? !c.attributes.grade : c.attributes.grade === Number(grade))) &&
        (special === 'All effects' ||
          (special === 'None' ? !c.attributes.effect : c.attributes.effect === special)) &&
        (status === 'All cards' ||
          (status === 'Perfect'
            ? c.snapshot.perfect
            : status === 'Limited'
              ? c.attributes.limited
              : status === 'Listed'
                ? c.status === 'listed'
                : status === 'Trade locked'
                  ? c.status === 'locked'
                  : status === 'On display'
                    ? c.status === 'displayed'
                    : status === 'At auction'
                      ? c.status === 'auctioned'
                      : c.status === 'owned')) &&
        (source === 'All sources' || c.source === source),
    )
    .sort((a, b) =>
      sort === 'True Value'
        ? b.snapshot.tv - a.snapshot.tv
        : sort === 'Quick Sell Value'
          ? b.snapshot.qsv - a.snapshot.qsv
          : sort === 'Market estimate'
            ? marketValue(b.attributes, b.snapshot.tv, view.sales).value -
              marketValue(a.attributes, a.snapshot.tv, view.sales).value
            : sort === 'Rarity'
              ? rarities.indexOf(b.attributes.rarity) - rarities.indexOf(a.attributes.rarity)
              : sort === 'Serial'
                ? (a.serial || a.attributes.serial || Infinity) - (b.serial || b.attributes.serial || Infinity)
                : sort === 'Oldest first'
                  ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
                  : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
  const select = (c: Card) =>
    setSelected((s) => s.includes(c.id) ? s.filter((id) => id !== c.id) : s.length < maxQuickSellCards ? [...s, c.id] : s)
  const bulkSelection = results.filter(c => c.status === 'owned').slice(0, maxQuickSellCards)
  const selectedCards = view.cards.filter(c => selected.includes(c.id) && c.status === 'owned')
  const duplicates = view.duplicateSale
  return (
    <>
      <Title
        title="A collection that’s entirely yours."
        text={`${view.cards.length} cards · ${fmt(view.cards.reduce((n, c) => n + c.snapshot.tv, 0))} collection True Value · your next favorite is out there.`}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={view.preview || !duplicates?.ids.length}
            onClick={() => { if (duplicates?.ids.length) onSellDuplicates(duplicates) }}>
            Sell all dupes{duplicates?.ids.length ? ` (${fmt(duplicates.ids.length)})` : ''}
          </Button>
          <Link href="/packs">
            <Button>
              <Icon name="packs" size={15} />
              Open a pack
            </Button>
          </Link>
        </div>
      </Title>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-50 flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-3 text-[#70647e]" />
          <input
            className={`${inputClass} pl-10!`}
            placeholder="Search name, card ID, or rarity…"
            aria-label="Search your collection"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className={`${inputClass} w-auto!`}
          aria-label="Rarity filter"
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
        >
          {['All rarities', ...rarities].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => setFilters(!filters)}>
          <Icon name="settings" size={14} />
          Filters{filters ? ' −' : ' +'}
        </Button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className={`${inputClass} w-auto!`}
          aria-label="Sort cards"
        >
          {[
            'Newest first',
            'Oldest first',
            'Rarity',
            'True Value',
            'Quick Sell Value',
            'Market estimate',
            'Serial',
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <div className="flex items-center rounded-lg border border-white/10 p-1">
          <button
            aria-label="Grid view"
            aria-pressed={grid}
            onClick={() => setGrid(true)}
            className={`rounded p-2 ${grid ? 'bg-white/7 text-[#b39ae6]' : 'text-[#71657f]'}`}
          >
            <Icon name="grid" size={15} />
          </button>
          <button
            aria-label="List view"
            aria-pressed={!grid}
            onClick={() => setGrid(false)}
            className={`rounded p-2 ${!grid ? 'bg-white/7 text-[#b39ae6]' : 'text-[#71657f]'}`}
          >
            <Icon name="list" size={15} />
          </button>
        </div>
      </div>
      {filters && (
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-white/8 bg-white/2 p-4 lg:grid-cols-3">
          {[
            {
              label: 'Quality',
              options: ['All qualities', ...qualities],
              value: quality,
              set: setQuality,
            },
            {
              label: 'Mutation',
              options: ['All mutations', 'No Mutation', ...mutations],
              value: mutation,
              set: setMutation,
            },
            {
              label: 'Grade',
              options: [
                'All grades',
                'Not rolled',
                ...Array.from({ length: 10 }, (_, i) => String(i + 1)),
              ],
              value: grade,
              set: setGrade,
            },
            {
              label: 'Effect',
              options: ['All effects', 'None', ...Object.keys(view.rules.effects)],
              value: special,
              set: setSpecial,
            },
            {
              label: 'Status',
              options: [
                'All cards',
                'Available',
                'Perfect',
                'Limited',
                'Listed',
                'Trade locked',
                'On display',
                'At auction',
              ],
              value: status,
              set: setStatus,
            },
            {
              label: 'Source pack',
              options: ['All sources', ...new Set(view.cards.map((c) => c.source))],
              value: source,
              set: setSource,
            },
          ].map((f) => (
            <Field key={f.label} label={f.label}>
              <select
                className={inputClass}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
              >
                {f.options.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-[10px] text-[#83748f]">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-[#a58aff]"
              checked={
                bulkSelection.length > 0 && bulkSelection.every(c => selected.includes(c.id))
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? bulkSelection.map(c => c.id)
                    : [],
                )
              }
            />
            Select up to {maxQuickSellCards} available cards
          </label>
          <span>{results.length} results</span>
          {results.length>visible&&<Button variant="ghost" onClick={()=>setVisible(n=>n+60)}>Show 60 more ({Math.min(visible,results.length)} shown)</Button>}
        </div>
        {!!selectedCards.length && (
          <Button
            variant="danger"
            className="min-h-8! py-1.5!"
            onClick={() => onSell(selectedCards)}
          >
            Quick-sell {selectedCards.length} selected
          </Button>
        )}
      </div>
      {results.length ? (
        grid ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {results.slice(0,visible).map((c) => (
              <CardTile
                key={c.id}
                card={c}
                selected={selected.includes(c.id)}
                onSelect={c.status === 'owned' ? () => select(c) : undefined}
                onClick={() => onInspect(c)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/3 text-[9px] uppercase tracking-wider text-[#8e7b9f]">
                <tr>
                  {['', 'Card', 'Rarity / quality', 'Grade', 'True Value', 'Status'].map((h, i) => (
                    <th key={i} className="p-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.slice(0,visible).map((c) => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="p-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.name}`}
                        disabled={c.status !== 'owned'}
                        checked={selected.includes(c.id)}
                        onChange={() => select(c)}
                        className="accent-[#a58aff]"
                      />
                    </td>
                    <td className="p-4">
                      <button onClick={() => onInspect(c)} className="text-[#c1a8ed]">
                        {c.name}
                      </button>
                      <p className="mt-1 font-mono text-[8px] text-[#70637d]">
                        {c.id.slice(0, 12)}
                      </p>
                    </td>
                    <td className="p-4">
                      <p>{c.attributes.rarity}</p>
                      <p className="mt-1 text-[9px] text-[#8b799b]">{c.attributes.quality}</p>
                    </td>
                    <td className="p-4">{c.attributes.grade || 'Not rolled'}</td>
                    <td className="p-4">
                      <Credits value={c.snapshot.tv} />
                    </td>
                    <td className="p-4 text-[10px] capitalize text-[#91829e]">
                      {cardStatusLabel(c.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Empty
          title={
            view.cards.length
              ? 'No cards match these filters.'
              : 'Your collection starts with a possibility.'
          }
        >
          {view.cards.length ? (
            <button
              onClick={() => {
                setQuery('')
                setRarity('All rarities')
                setQuality('All qualities')
                setMutation('All mutations')
                setGrade('All grades')
                setSpecial('All effects')
                setStatus('All cards')
                setSource('All sources')
              }}
              className="text-[#bba0ed]"
            >
              Clear all filters
            </button>
          ) : (
            <Link href="/packs" className="text-[#bba0ed]">
              Explore the pack shop
            </Link>
          )}
        </Empty>
      )}
    </>
  )
}
export function Odds({ pack, rules }: { pack: Pack; rules: Rules }) {
  const odds = pack.displayOdds ?? pack.odds
  const pct = (n: number) => n > 0 && n < 0.000001 ? n.toPrecision(3) : Number(n.toFixed(6))
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {pack.pool && <section className="rounded-lg border border-white/10 p-4 md:col-span-2">
        <h3 className="mb-3 text-xs font-medium">Exact assigned contents · independent draw per card slot</h3>
        {pack.pool.map((entry) => <p key={entry.designId} className="mb-2 flex flex-wrap justify-between gap-2 text-[11px] text-[#bda4d0]"><span>{entry.name} · {entry.rarity}</span><span>{pct(entry.weight)}%</span></p>)}
      </section>}
      <div>
        <h3 className="mb-3 text-xs font-medium">12 standard rarities · 100% total</h3>
        <div className="space-y-2">
          {rarities.map((r, i) => (
            <div
              key={r}
              className="flex items-center justify-between border-b border-white/4 pb-2 text-[10px]"
            >
              <span className="text-[#ab9ab9]">{r}</span>
              <span className="font-mono text-[#cec0db]">{pct(odds.rarity[i])}%</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium">Quality · always rolled · 100% total</h3>
        <div className="space-y-2">
          {qualities.map((q, i) => (
            <div key={q} className="flex justify-between text-[10px] text-[#a693b7]">
              <span>{q}</span>
              <span className="font-mono">{pct(odds.quality[i])}%</span>
            </div>
          ))}
        </div>
        <h3 className="mb-3 mt-6 text-xs font-medium">Final attribute chances · design guarantees included</h3>
        <div className="space-y-3 text-[10px] text-[#a693b7]">
          <p className="flex justify-between">
            <span>Graded (random grades are uniform 1–10)</span>
            <span>{pct(odds.grade)}%</span>
          </p>
          <p className="flex justify-between">
            <span>Exactly one mutation</span>
            <span>{pct(odds.mutation)}%</span>
          </p>
          <p className="flex justify-between">
            <span>Special effect</span>
            <span>{pct(odds.effect)}%</span>
          </p>
        </div>
        <details className="mt-5 rounded-lg border border-white/8 p-3 text-[10px] text-[#aa97ba]">
          <summary className="cursor-pointer">Conditional mutation distribution</summary>
          <div className="mt-3 space-y-2">
            {(pack.mutationOdds ?? mutationDistribution(rules)).map(({ name, weight, multiplier }) => (
              <p key={name} className="flex justify-between gap-3">
                <span>
                  {name} <span className="text-[#806b90]">×{multiplier}</span>
                </span>
                <span>{pct(weight)}%</span>
              </p>
            ))}
            <p className="mt-3 leading-5 text-[#806b90]">
              {odds.mutation > 0 ? 'Conditional on the final card having a mutation, including design guarantees. These chances total 100%; the overall chance is shown above.' : 'This configuration cannot produce a mutation.'} A card can have only one mutation.
            </p>
          </div>
        </details>
        {!!pack.overrides?.length && <details className="mt-4 rounded-lg border border-white/10 p-3 text-[10px] leading-6 text-[#b49cc7]"><summary className="cursor-pointer">Design guarantees and custom base values</summary>{pack.overrides.map((d,i)=><p className="mt-3" key={`${d.name}-${i}`}><strong>{d.name}</strong>{d.baseValue!=null?` · base ${d.baseValue.toLocaleString()}`:''}{Object.entries(d.defaults??{}).map(([key,value])=>` · ${key}: ${value??'none'}`).join('')}</p>)}</details>}
        <p className="mt-5 text-[10px] leading-6 text-[#80708f]">
          Each card rolls independently. Unrolled attributes are neutral—not missing data. An
          ungraded card can receive one permanent assessment at the grading desk for a disclosed
          fee.{' '}
          {pack.limited
            ? 'This is an exclusive Limited release.'
            : 'Limited is a separate release category and cannot appear in this pack.'}{' '}
          Odds do not guarantee a particular result.
        </p>
      </div>
    </div>
  )
}
export function PackPurchase({
  pack,
  balance,
  busy,
  onOdds,
  onOpen,
}: {
  pack: Pack
  balance: number
  busy: boolean
  onOdds: () => void
  onOpen: (n: number) => void
}) {
  const [count, setCount] = useState(1)
  return (
    <>
      <PackVisual pack={pack} />
      <h3 className="text-center font-display text-2xl">{pack.name}</h3>
      <p className="mt-2 text-center text-xs text-[#93809f]">
        {pack.count} cards per pack · {pack.subtitle}
      </p>
      <div className="my-6 flex items-center justify-between rounded-lg border border-white/8 p-4">
        <span className="text-xs text-[#a393b0]">Open simultaneously</span>
        <div className="flex max-w-60 flex-wrap justify-end gap-2">
          {Array.from({length:10}, (_,i)=>i+1).map((n) => (
            <button
              onClick={() => setCount(n)}
              key={n}
              aria-pressed={count === n}
              className={`h-9 w-9 rounded-lg border text-xs ${count === n ? 'border-[#ab90e8] bg-[#ab90e8]/15 text-[#d3bdf5]' : 'border-white/8 text-[#8e7a9f]'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-5 flex items-center justify-between text-xs">
        <span className="text-[#8d7a9f]">{pack.count * count} cards · separate reveal reels</span>
        <button className="text-[#baa0e8]" onClick={onOdds}>
          View odds before opening
        </button>
      </div>
      <Button
        className="w-full"
        disabled={
          busy ||
          balance < pack.price * count ||
          !!packUnavailable(pack) ||
          (pack.remainingStock != null && count > pack.remainingStock)
        }
        onClick={() => onOpen(count)}
      >
        {busy ? (
          'Committing your opening…'
        ) : (
          <>
            Open {count} {count === 1 ? 'pack' : 'packs'}
            <span className="mx-2 opacity-30">|</span>
            <Credits value={pack.price * count} />
          </>
        )}
      </Button>
      {balance < pack.price * count && (
        <p className="mt-3 text-center text-[10px] text-[#d0ac7c]">
          Not enough credits. Claim your free daily reward.
        </p>
      )}
      <p className="mt-4 text-center text-[9px] leading-5 text-[#75667f]">
        Cards and price are committed together before animation begins.
        <br />
        In-game credits only. No deposits or cash-outs.
      </p>
    </>
  )
}
export function CardDetail({
  card,
  view,
  onSell,
  onList,
  onTrade,
}: {
  card: Card
  view: GameView
  onSell: (c: Card) => void
  onList: (c: Card) => void
  onTrade: () => void
}) {
  const pmv = marketValue(card.attributes, card.snapshot.tv, view.sales)
  const own = card.owner === view.player.id && !view.preview,
    available = own && card.status === 'owned'
  return (
    <div className="grid gap-6 md:grid-cols-[230px_1fr]">
      <div>
        <CardTile card={card} />
        <div className="mt-4 space-y-2 text-[9px] text-[#8e7c9e]">
          <p className="break-all font-mono">Card ID: {card.id}</p>
          <p>Opened {new Date(card.createdAt).toLocaleString()}</p>
          <p>Source: {card.source}</p>
          {card.attributes.limited && (
            <p>
              Limited serial: #{card.attributes.serial}
              {card.attributes.edition ? `/${card.attributes.edition}` : ''} Unboxed
            </p>
          )}
          {card.perfectSerial && (
            <p className="text-[#dbc18d]">
              Perfect serial: #{card.perfectSerial} ·{' '}
              {card.attributes.release || card.attributes.rarity} scope
            </p>
          )}
        </div>
      </div>
      <div>
        {card.description && <p className="mb-5 text-xs leading-7 text-[#ae96bf]">{card.description}</p>}
        <div className="mb-4 flex flex-wrap gap-2">
          <Tag>{card.attributes.rarity}</Tag>
          {card.snapshot.perfect && <Tag tone="amber">PERFECT · +450%</Tag>}
          {card.attributes.limited && <Tag tone="rose">LIMITED</Tag>}
          <Tag tone="blue">
            {card.status === 'locked' ? 'TRADE LOCKED' : card.status.toUpperCase()}
          </Tag>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Quick Sell', value: card.snapshot.qsv, hint: 'Convenience sale' },
            { label: 'True Value', value: card.snapshot.tv, hint: 'Game reference' },
            {
              label: 'PMV estimate',
              value: pmv.value,
              hint: pmv.count ? `${pmv.count} comparable sales` : 'No sales · TV fallback',
            },
          ].map((v) => (
            <div key={v.label} className="rounded-lg border border-white/8 bg-white/2 p-3">
              <p className="text-[9px] text-[#94819f]">{v.label}</p>
              <Credits value={v.value} className="mt-2 text-sm" />
              <p className="mt-2 text-[8px] text-[#6e5f7d]">{v.hint}</p>
            </div>
          ))}
        </div>
        <div className="my-5 grid grid-cols-2 gap-3 text-[10px]">
          {[
            ['Quality', card.attributes.quality],
            [
              'Grade',
              card.attributes.grade
                ? `${card.attributes.grade} / 10 · ${card.gradedAt ? 'grading desk' : 'rolled at opening'}`
                : 'Not rolled · neutral',
            ],
            ['Mutation', card.attributes.mutation || 'No Mutation'],
            ['Design mint serial', card.serial ? `#${card.serial} · this design` : 'Legacy mint · original ID preserved'],
            ['Limited serial', card.attributes.limited ? `#${card.attributes.serial} · ${card.designId ? 'this design / release' : 'legacy release'}` : 'Not Limited'],
            ['Special effect', card.attributes.effect || 'None · not rolled'],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="mb-1 text-[8px] uppercase tracking-wider text-[#7e6b8f]">{k}</p>
              <p className="text-[#c1b0ce]">{v}</p>
            </div>
          ))}
        </div>
        <details open className="rounded-lg border border-white/8 p-4">
          <summary className="cursor-pointer text-xs font-medium">
            How value is calculated{' '}
            <span className="ml-2 text-[9px] font-normal text-[#7a668e]">
              formula v{card.snapshot.version}
            </span>
          </summary>
          <div className="mt-4 space-y-2">
            {card.snapshot.steps.map((s, i) => (
              <div key={i} className="flex justify-between gap-4 text-[9px]">
                <span className="text-[#9985aa]">
                  {s.label}
                  {s.multiplier != null && (
                    <span className="ml-1 text-[#c1a8d6]"> ×{s.multiplier}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[#b7a3c6]">
                  {s.amount.toLocaleString('en-US', { maximumFractionDigits: 3 })}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-white/8 pt-2 text-[10px]">
              <span>Final True Value · rounded down once</span>
              <span>{fmt(card.snapshot.tv)}</span>
            </div>
            <div className="flex justify-between text-[9px] text-[#9b86ac]">
              <span>Quick Sell · floor(TV × 0.65)</span>
              <span>{fmt(card.snapshot.qsv)}</span>
            </div>
          </div>
        </details>
        <details className="mt-3 rounded-lg border border-white/8 p-4 text-[10px]">
          <summary className="cursor-pointer text-[#b7a2ca]">
            PMV methodology & ownership history
          </summary>
          <p className="mt-3 leading-6 text-[#8c779f]">
            PMV is the mean of up to 10 most recent completed sales in the last 30 days with the
            same rarity, quality, grade, mutation, effect and release. Without matches it falls back
            to TV. It is an estimate, never a guaranteed sale price.{' '}
            {pmv.lastSale && `Last comparable sale: ${new Date(pmv.lastSale).toLocaleString()}.`}
          </p>
          <div className="mt-3 space-y-2">
            {card.provenance.map((p, i) => (
              <p key={i} className="text-[9px] text-[#a18ab3]">
                {p.action} · {new Date(p.at).toLocaleString()}
              </p>
            ))}
          </div>
        </details>
        {card.openingSnapshot && (
          <p className="mt-3 text-[9px] leading-5 text-[#8e779f]">
            Immutable opening snapshot: {fmt(card.openingSnapshot.tv)} TV · formula v
            {card.openingSnapshot.version}. The values above use the current published formula.
            Historical transaction amounts are never rewritten.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={!available} onClick={() => onList(card)}>
            <Icon name="market" size={14} />
            List on market
          </Button>
          <Button variant="secondary" disabled={!available} onClick={() => onSell(card)}>
            Quick-sell
          </Button>
          <Button variant="ghost" disabled={!available} onClick={onTrade}>
            <Icon name="trade" size={14} />
            Trade
          </Button>
          {available && (
            <Link
              href="/auctions"
              className="inline-flex items-center rounded-lg border border-white/10 px-4 py-2 text-xs text-[#bda0df]"
            >
              Auction card
            </Link>
          )}
          {available && !card.attributes.grade && (
            <Link
              href="/grading"
              className="inline-flex items-center rounded-lg border border-white/10 px-4 py-2 text-xs text-[#bda0df]"
            >
              Grading desk
            </Link>
          )}
          {available && (
            <Link
              href="/display"
              className="inline-flex items-center rounded-lg border border-white/10 px-4 py-2 text-xs text-[#bda0df]"
            >
              Display card
            </Link>
          )}
        </div>
        {view.preview && (
          <p className="mt-2 text-[9px] text-[#8b759f]">
            This card belongs to another collector. Open a pack to start your own collection.
          </p>
        )}
      </div>
    </div>
  )
}
export function ListingForm({
  card,
  view,
  busy,
  onSubmit,
}: {
  card: Card
  view: GameView
  busy: boolean
  onSubmit: (n: number) => void
}) {
  const pmv = marketValue(card.attributes, card.snapshot.tv, view.sales),
    [price, setPrice] = useState(pmv.value)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(price)
      }}
    >
      <div className="mb-5 rounded-lg border border-white/8 p-4">
        <h3 className="font-display text-lg">{card.name}</h3>
        <p className="mt-1 text-[10px] text-[#9984ac]">
          {card.attributes.rarity} · {card.attributes.quality}
        </p>
        <div className="mt-4 flex justify-between text-xs">
          <span className="text-[#9b85ac]">PMV estimate ({pmv.count} comparable sales)</span>
          <Credits value={pmv.value} />
        </div>
      </div>
      <Field label="Your asking price · credits">
        <input
          className={inputClass}
          type="number"
          min="1"
          max="1000000000000"
          required
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </Field>
      <div className="my-4 flex justify-between text-xs">
        <span className="text-[#93809f]">You receive after {view.rules.fee * 100}% market fee</span>
        <Credits value={Math.max(0, price - Math.floor(price * view.rules.fee))} />
      </div>
      <p className="my-5 text-[10px] leading-6 text-[#857192]">
        Your card is locked while listed. You may edit or cancel an unsold listing. PMV is only an
        estimate; a buyer is never guaranteed.
      </p>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Creating listing…' : 'Confirm & list card'}
      </Button>
    </form>
  )
}
export function Market({
  view,
  onInspect,
  onBuy,
  onList,
  act,
}: {
  view: GameView
  onInspect: (c: Card) => void
  onBuy: (l: GameView['listings'][number]) => void
  onList: () => void
  act: Act
}) {
  const [tab, setTab] = useState('All listings'),
    [query, setQuery] = useState(''),
    [rarity, setRarity] = useState('All rarities'),
    [sort, setSort] = useState('Newest'),
    [edit, setEdit] = useState(''),
    [price, setPrice] = useState(0)
  const listings = view.listings
    .filter(
      (l) =>
        (tab !== 'My listings' || l.seller === view.player.id) &&
        `${l.cardData.name} ${l.cardData.id} ${l.sellerName}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (rarity === 'All rarities' || l.cardData.attributes.rarity === rarity),
    )
    .sort((a, b) =>
      sort === 'Price: low to high'
        ? a.price - b.price
        : sort === 'Price: high to low'
          ? b.price - a.price
          : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
  return (
    <>
      <Title
        title="One collector’s find. Your next favorite."
        text="A player-driven market. Real asking prices, transparent estimates, and a new story for every card."
      >
        <Button onClick={onList}>
          <Icon name="plus" size={15} />
          List a card
        </Button>
      </Title>
      <Tabs
        current={tab}
        set={setTab}
        options={['All listings', 'My listings', 'Completed sales']}
      />
      {tab === 'Completed sales' ? (
        <div className="overflow-x-auto rounded-xl border border-white/8">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/3 text-[10px] text-[#9680a8]">
              <tr>
                {['Date', 'Card / rarity', 'Sale amount', 'Activity'].map((h) => (
                  <th className="p-4" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...view.sales].reverse().map((s, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="p-4 text-[10px] text-[#9c85af]">
                    {new Date(s.at).toLocaleString()}
                  </td>
                  <td className="p-4">
                    {s.attributes.rarity}
                    <p className="mt-1 text-[9px] text-[#8a749a]">{s.attributes.quality}</p>
                  </td>
                  <td className="p-4">
                    <Credits value={s.amount} />
                  </td>
                  <td className="p-4">
                    <Tag tone={s.demo ? 'violet' : 'emerald'}>
                      {s.demo ? 'SEEDED DEMO SALE' : 'COMPLETED SALE'}
                    </Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!view.sales.length && (
            <Empty title="No completed sales yet">
              Completed sales—not asking prices—inform market estimates.
            </Empty>
          )}
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            <input
              className={`${inputClass} min-w-45 flex-1`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search market"
              placeholder="Search card name, ID, or seller…"
            />
            <select
              className={`${inputClass} w-auto!`}
              aria-label="Filter market rarity"
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
            >
              {['All rarities', ...rarities].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select
              className={`${inputClass} w-auto!`}
              aria-label="Sort listings"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {['Newest', 'Price: low to high', 'Price: high to low'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          {listings.length ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {listings.map((l) => (
                <div key={l.id} className="rounded-xl border border-white/8 bg-[#19171f] p-3">
                  <CardTile card={l.cardData} onClick={() => onInspect(l.cardData)} compact />
                  <div className="mt-4 flex justify-between text-[9px]">
                    <span className="text-[#8b749e]">Listed by</span>
                    <span>{l.sellerName}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-[9px]">
                    <span className="text-[#8b749e]">PMV estimate</span>
                    <Credits
                      value={
                        marketValue(l.cardData.attributes, l.cardData.snapshot.tv, view.sales).value
                      }
                    />
                  </div>
                  <div className="my-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[9px] text-[#8b749e]">Asking price</span>
                    <Credits value={l.price} className="text-sm" />
                  </div>
                  {l.seller === view.player.id && !view.preview ? (
                    edit === l.id ? (
                      <div className="space-y-2">
                        <input
                          aria-label="Updated asking price"
                          type="number"
                          min="1"
                          value={price}
                          onChange={(e) => setPrice(Number(e.target.value))}
                          className={inputClass}
                        />
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={async () => {
                              if (await act({ action: 'editListing', listing: l.id, price }))
                                setEdit('')
                            }}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" onClick={() => setEdit('')}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          className="flex-1 px-2!"
                          onClick={() => {
                            setEdit(l.id)
                            setPrice(l.price)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2!"
                          onClick={() => void act({ action: 'cancelListing', listing: l.id })}
                        >
                          Cancel
                        </Button>
                      </div>
                    )
                  ) : (
                    <Button className="w-full" onClick={() => onBuy(l)}>
                      Review purchase
                      <Icon name="arrow" size={13} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="market" title="Nothing listed here just yet.">
              {tab === 'My listings'
                ? 'Select an owned card in your collection to choose an asking price.'
                : 'Try another filter or be the first to list a card.'}
            </Empty>
          )}
        </>
      )}
      <p className="mt-6 flex items-start gap-2 text-[10px] leading-6 text-[#81708f]">
        <Icon name="shield" size={15} className="mt-1 shrink-0" />
        Ownership and balances are revalidated before purchase. You cannot buy your own listing. PMV
        is not a guaranteed execution price. Seeded activity is labeled demo.
      </p>
    </>
  )
}
export function Slots({ view, act, busy }: { view: GameView; act: Act; busy: boolean }) {
  const [tier, setTier] = useState('copper')
  const [rolling, setRolling] = useState(false),
    [symbols, setSymbols] = useState(['VII', 'VII', 'VII']),
    [result, setResult] = useState('Your next little stroke of luck.'),
    [cooldown, setCooldown] = useState(0)
  const rules = slotConfiguration(view.rules, tier)
  const progress = view.progression?.advancement
  const [sessionMinutes, setSessionMinutes] = useState(0),
    [dismissedReminder, setDismissedReminder] = useState(0)
  const reminderMinutes = rules.reminderMinutes ?? 15
  const reminderNumber = reminderMinutes > 0 ? Math.floor(sessionMinutes / reminderMinutes) : 0
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(
      () => setSessionMinutes(Math.floor((Date.now() - start) / 60000)),
      60000,
    )
    return () => clearInterval(timer)
  }, [])
  const spin = async () => {
    setRolling(true)
    const r = await act({ action: 'spin', tier })
    if (!r?.spin) {
      setRolling(false)
      return
    }
    setTimeout(
      () => {
        setSymbols(r.spin!.symbols)
        setResult(
          `${r.spin!.amount ? `+${fmt(r.spin!.amount)} reward` : 'No reward'} · net ${r.spin!.amount - rules.cost >= 0 ? '+' : ''}${r.spin!.amount - rules.cost} credits`,
        )
        setRolling(false)
        setCooldown(rules.cooldown)
        const timer = setInterval(
          () =>
            setCooldown((n) => {
              if (n <= 1) clearInterval(timer)
              return Math.max(0, n - 1)
            }),
          1000,
        )
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400,
    )
  }
  const spins =
    view.player.spinDay === new Date().toISOString().slice(0, 10) ? view.player.spins || 0 : 0
  return (
    <>
      <Title
        title="A little luck goes a long way."
        text="An optional game of chance, not a reliable income. No real money. No cash-outs."
      />
      <div className="mb-6 grid gap-2 sm:grid-cols-5">{slotTiers.map(t => {
        const locked = (progress?.level ?? 1) < t.level || (progress?.peakWorth ?? 0) < t.worth
        return <button key={t.id} disabled={rolling||busy||locked} aria-pressed={tier===t.id} onClick={()=>setTier(t.id)} className={`rounded-xl border p-4 text-left disabled:opacity-40 ${tier===t.id?'border-[#bea0e3]/50 bg-[#bea0e3]/10':'border-white/10'}`}><p className="text-xs text-[#d2bce5]">{t.name}</p><p className="mt-2 text-[9px] leading-5 text-[#9882ac]">{t.multiplier}× table · Lv {t.level}<br/>{fmt(t.worth)} peak worth</p></button>
      })}</div>
      {reminderNumber > dismissedReminder && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#d2ba80]/25 bg-[#d2ba80]/5 p-5"
        >
          <p className="text-xs leading-6 text-[#d3bc96]">
            You’ve spent {sessionMinutes} minutes in Lucky Slots. Your vault will still be
            here—consider taking a break.
          </p>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-lg bg-[#d2ba80]/15 px-3 py-2 text-[11px] text-[#d3bc96]"
            >
              Take a break
            </Link>
            <Button variant="ghost" onClick={() => setDismissedReminder(reminderNumber)}>
              Dismiss reminder
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-[#b293e2]/20 bg-linear-to-b from-[#211a2d] to-[#16141d] p-6 sm:p-10">
          <div className="mb-8 text-center">
            <Tag>
              <Icon name="spark" size={12} /> THE VAULT LUCKY CLUB
            </Tag>
            <h2 className="mt-5 font-display text-4xl font-medium tracking-[-.04em]">
              Good things come in threes.
            </h2>
          </div>
          <div className="mx-auto flex max-w-md gap-3 rounded-2xl border border-[#b293e2]/20 bg-[#0e0d13] p-4 shadow-[inset_0_0_40px_#0008]">
            {symbols.map((s, i) => (
              <div
                key={i}
                className={`slot-symbol flex h-34 flex-1 items-center justify-center rounded-xl border border-[#c6a7eb]/20 bg-linear-to-b from-[#26202e] via-[#1d1825] to-[#26202e] font-display text-4xl text-[#c6a7eb] sm:h-40 sm:text-5xl ${rolling ? 'slots-rolling' : ''}`}
              >
                {rolling ? <Icon name="diamond" size={38} /> : s}
              </div>
            ))}
          </div>
          <p role="status" className="my-6 text-center text-xs text-[#b49bc7]">
            {rolling ? 'Spinning… waiting for the server-confirmed reveal.' : result}
          </p>
          <div className="mx-auto max-w-xs">
            <Button
              className="w-full py-3.5!"
              onClick={() => void spin()}
              disabled={
                busy ||
                rolling ||
                cooldown > 0 ||
                !rules.enabled ||
                spins >= rules.dailyLimit ||
                view.player.balance < rules.cost
              }
            >
              {rolling ? (
                'Revealing…'
              ) : cooldown ? (
                `Take a breath · ${cooldown}s`
              ) : (
                <>
                  Spin for <Credits value={rules.cost} />
                  <Icon name="arrow" size={15} />
                </>
              )}
            </Button>
            <p className="mt-3 text-center text-[9px] text-[#7e6b8e]">
              {spins} / {rules.dailyLimit} daily spins · {rules.cooldown}s cooldown
            </p>
          </div>
          <div className="mt-8 flex justify-between border-t border-white/7 pt-5 text-[10px] text-[#92809f]">
            <span>
              Today’s casino entries: <Credits value={view.casino?.spent ?? spins * view.rules.slots.cost} />
            </span>
            <Link href="/settings" className="text-[#bca1e0]">
              Set a spending limit
            </Link>
          </div>
        </section>
        <section>
          <div className="rounded-xl border border-white/8 bg-[#18151f] p-5">
            <h3 className="mb-5 font-display text-lg">No secrets. Just odds.</h3>
            <div className="space-y-4">
              {rules.rewards.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-white/5 pb-3 text-[10px]"
                >
                  <span className="w-25 font-mono tracking-[.12em] text-[#af93c3]">
                    {r.symbols.join(' ')}
                  </span>
                  <Credits value={r.amount} />
                  <span className="text-[#897396]">{r.weight}%</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-6 text-[#8e779f]">
              Reward range: 0–{fmt(Math.max(...rules.rewards.map((r) => r.amount)))} credits.
              Displayed odds total 100%. A reward of {rules.cost} credits returns the play cost.
              Outcomes are independent.
            </p>
            <p className="mt-3 text-[10px] leading-6 text-[#b19ac3]">
              Average gross reward:{' '}
              {rules.rewards
                .reduce((sum, reward) => sum + (reward.amount * reward.weight) / 100, 0)
                .toFixed(2)}{' '}
              credits per play, before the {rules.cost}-credit cost. A reward is never guaranteed.
              Use the free daily grant or collection jobs for predictable income.
            </p>
          </div>
          <div className="mt-5 rounded-xl border border-[#d2ba80]/15 bg-[#d2ba80]/4 p-5">
            <div className="flex gap-2 text-[#c8b088]">
              <Icon name="shield" size={18} />
              <h3 className="text-xs font-medium">Keep it a little fun.</h3>
            </div>
            <p className="mt-3 text-[10px] leading-6 text-[#968375]">
              Slots use fictional credits. They have no real-money value and cannot be redeemed. The
              server enforces cooldowns, balance checks and daily limits. Take regular breaks—there
              is no need to chase a result.
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              disabled={busy || view.player.lastDaily === new Date().toISOString().slice(0, 10)}
              onClick={() => void act({ action: 'daily' })}
            >
              Claim {dailyBaseReward(view.rules)} free daily credits
            </Button>
          </div>
        </section>
      </div>
    </>
  )
}
export function Trading({
  view,
  onCreate,
  onReview,
}: {
  view: GameView
  onCreate: () => void
  onReview: (t: Trade) => void
}) {
  const [tab, setTab] = useState('Active offers')
  const trades = view.trades.filter((t) =>
    tab === 'Active offers'
      ? t.status === 'pending' && Date.parse(t.expires) > Date.now()
      : t.status !== 'pending' || Date.parse(t.expires) <= Date.now(),
  )
  return (
    <>
      <Title
        title="Great collections are built together."
        text="Swap cards, exchange credits, and find a deal that works on both sides."
      >
        <Button onClick={onCreate}>
          <Icon name="trade" size={15} />
          Propose a trade
        </Button>
      </Title>
      <Tabs current={tab} set={setTab} options={['Active offers', 'Trade history']} />
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#aa8bdb]/15 bg-[#aa8bdb]/4 p-4">
        <Icon name="shield" size={18} className="mt-1 shrink-0 text-[#af90d9]" />
        <p className="text-[10px] leading-6 text-[#9a82ac]">
          Your offered cards and credits are reserved immediately. The other collector reserves
          their side when they confirm. Both sides must confirm the same revision; any edit clears
          both confirmations. Offers expire after 24 hours. Only registered collectors can trade;
          historical demo accounts cannot accept offers.
        </p>
      </div>
      {trades.length ? (
        <div className="space-y-3">
          {[...trades].reverse().map((t) => (
            <article
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-white/8 bg-[#18151e] p-5"
            >
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <h3 className="text-xs">
                    {view.players.find((p) => p.id === t.from)?.name || 'Collector'}{' '}
                    <span className="mx-2 text-[#8d73a1]">↔</span>{' '}
                    {view.players.find((p) => p.id === t.to)?.name || 'Collector'}
                  </h3>
                  <Tag tone={t.status === 'completed' ? 'emerald' : 'violet'}>
                    {Date.parse(t.expires) <= Date.now() && t.status === 'pending'
                      ? 'EXPIRED'
                      : t.status.toUpperCase()}
                  </Tag>
                </div>
                <p className="text-[10px] text-[#90779f]">
                  {t.fromCards.length} cards + {fmt(t.fromCoins)} credits{' '}
                  <span className="mx-2">for</span> {t.toCards.length} cards + {fmt(t.toCoins)}{' '}
                  credits
                </p>
                <p className="mt-2 text-[9px] text-[#6d577f]">
                  Revision {t.revision} · {t.accepted.length}/2 confirmed · expires{' '}
                  {new Date(t.expires).toLocaleString()}
                </p>
              </div>
              <Button variant="secondary" onClick={() => onReview(t)}>
                Review exchange
                <Icon name="arrow" size={13} />
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon="trade"
          title={
            tab === 'Active offers'
              ? 'A good trade starts with a conversation.'
              : 'Your trading story is yet to be written.'
          }
        >
          Choose a collector and build your exact exchange. Nothing transfers until both sides
          agree.
          <div className="mt-4">
            <Button variant="secondary" onClick={onCreate}>
              Create an offer
            </Button>
          </div>
        </Empty>
      )}
    </>
  )
}
export function TradeForm({
  view,
  initialCard,
  initialTrade,
  busy,
  onSubmit,
}: {
  view: GameView
  initialCard?: Card
  initialTrade?: Trade
  busy: boolean
  onSubmit: (v: Omit<GameCommand, 'key'>) => void
}) {
  const [to, setTo] = useState(
      initialTrade?.to || view.players.find((p) => p.id !== view.player.id && !p.demo)?.id || '',
    ),
    [fromCards, setFromCards] = useState<string[]>(
      initialTrade?.fromCards || (initialCard ? [initialCard.id] : []),
    ),
    [toCards, setToCards] = useState<string[]>(initialTrade?.toCards || []),
    [fromCoins, setFromCoins] = useState(initialTrade?.fromCoins || 0),
    [toCoins, setToCoins] = useState(initialTrade?.toCoins || 0),
    [review, setReview] = useState(false)
  const publicCards = (view as GameView & { publicCards?: Card[] }).publicCards || []
  const toggle = (selected: string[], id: string, set: (s: string[]) => void) =>
    set(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!review) {
          setReview(true)
          return
        }
        onSubmit({
          action: initialTrade ? 'editTrade' : 'trade',
          trade: initialTrade?.id,
          to,
          fromCards,
          toCards,
          fromCoins,
          toCoins,
        })
      }}
    >
      <Field label="Other collector">
        <select
          className={inputClass}
          value={to}
          required
          disabled={review}
          onChange={(e) => {
            setTo(e.target.value)
            setToCards([])
          }}
        >
          <option value="">Choose a collector</option>
          {view.players
            .filter((p) => p.id !== view.player.id && !p.demo)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        {[
          {
            title: 'You give',
            cards: view.cards.filter(
              (c) => c.status === 'owned' || initialTrade?.fromCards.includes(c.id),
            ),
            selected: fromCards,
            set: setFromCards,
            value: fromCoins,
            setValue: setFromCoins,
          },
          {
            title: 'You receive',
            cards: publicCards.filter(
              (c) =>
                c.owner === to && (c.status === 'owned' || initialTrade?.toCards.includes(c.id)),
            ),
            selected: toCards,
            set: setToCards,
            value: toCoins,
            setValue: setToCoins,
          },
        ].map((side) => (
          <div key={side.title} className="rounded-xl border border-white/8 p-4">
            <h3 className="mb-4 font-display text-lg">{side.title}</h3>
            <Field label="Credits">
              <input
                className={inputClass}
                type="number"
                min="0"
                required
                value={side.value}
                disabled={review}
                onChange={(e) => side.setValue(Number(e.target.value))}
              />
            </Field>
            <div className="max-h-65 space-y-2 overflow-auto">
              {side.cards.length ? (
                side.cards.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/2 p-3 text-[10px]"
                  >
                    <input
                      type="checkbox"
                      className="accent-[#a58aff]"
                      disabled={review}
                      checked={side.selected.includes(c.id)}
                      onChange={() => toggle(side.selected, c.id, side.set)}
                    />
                    <span className="flex-1">
                      {c.name}
                      <span className="mt-1 block text-[8px] text-[#8e749f]">
                        {c.attributes.rarity}
                      </span>
                    </span>
                    <Credits value={c.snapshot.tv} />
                  </label>
                ))
              ) : (
                <p className="py-5 text-center text-[10px] text-[#816c92]">
                  No available public cards. You can still offer credits.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {review && (
        <div className="mt-5 rounded-lg border border-[#bd9cea]/25 bg-[#bd9cea]/5 p-4 text-[11px] leading-6 text-[#baa1ce]">
          Final review: you give {fromCards.length} card(s) + {fmt(fromCoins)} credits and receive{' '}
          {toCards.length} card(s) + {fmt(toCoins)} credits. Assets will be reserved. Both parties
          must confirm the saved offer before it executes.
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        {review && (
          <Button variant="secondary" onClick={() => setReview(false)}>
            Edit offer
          </Button>
        )}
        <Button disabled={busy || !to} type="submit">
          {busy
            ? 'Reserving assets…'
            : review
              ? initialTrade
                ? 'Save new revision'
                : 'Create exact offer'
              : 'Review offer'}
          <Icon name="arrow" size={14} />
        </Button>
      </div>
    </form>
  )
}
export function TradeReview({
  trade: t,
  view,
  busy,
  act,
  onEdit,
}: {
  trade: Trade
  view: GameView
  busy: boolean
  act: Act
  onEdit: () => void
}) {
  const allCards = [
    ...view.cards,
    ...((view as GameView & { publicCards?: Card[] }).publicCards || []),
  ]
  const isPending = t.status === 'pending' && Date.parse(t.expires) > Date.now()
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Tag>
          {t.status.toUpperCase()} · REVISION {t.revision}
        </Tag>
        <span className="text-[10px] text-[#8e769e]">{t.accepted.length} / 2 confirmations</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { owner: t.from, cards: t.fromCards, coins: t.fromCoins },
          { owner: t.to, cards: t.toCards, coins: t.toCoins },
        ].map((side) => (
          <div key={side.owner} className="rounded-xl border border-white/10 p-4">
            <h3 className="mb-4 text-xs">
              {view.players.find((p) => p.id === side.owner)?.name || 'Collector'} gives{' '}
              {t.accepted.includes(side.owner) && (
                <span className="ml-1 text-[#8ac9ad]">· Confirmed</span>
              )}
            </h3>
            <Credits value={side.coins} className="mb-4 text-lg" />
            <div className="space-y-2">
              {side.cards.map((id) => (
                <div key={id} className="rounded bg-white/3 p-3 text-[10px]">
                  <p>{allCards.find((c) => c.id === id)?.name || 'Reserved card'}</p>
                  <p className="mt-1 break-all font-mono text-[8px] text-[#7c668e]">{id}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="my-5 text-[10px] leading-6 text-[#8e769f]">
        Review every card ID and credit amount. Confirming applies only to revision {t.revision}. An
        edit invalidates all prior acceptances. Execution is atomic; pending assets cannot be sold
        or listed.
      </p>
      {isPending && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || t.accepted.includes(view.player.id)}
            onClick={() => void act({ action: 'acceptTrade', trade: t.id, revision: t.revision })}
          >
            {t.accepted.includes(view.player.id)
              ? 'You confirmed this revision'
              : 'Confirm this exact exchange'}
          </Button>
          {t.from === view.player.id && (
            <Button variant="secondary" disabled={busy} onClick={onEdit}>
              Edit & reset confirmations
            </Button>
          )}
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              void act({
                action: t.from === view.player.id ? 'cancelTrade' : 'declineTrade',
                trade: t.id,
                revision: t.revision,
              })
            }
          >
            {t.from === view.player.id ? 'Cancel offer' : 'Decline offer'}
          </Button>
        </div>
      )}
    </>
  )
}
type RankedPlayer = GameView['players'][number] & {
  collectionValue?: number
  highestCard?: number
  perfects?: number
  rarityRank?: number
  salesCount?: number
}
export function Leaderboards({ view }: { view: GameView }) {
  const [tab, setTab] = useState('Net worth'),
    [period, setPeriod] = useState('All time'),
    [profile, setProfile] = useState<RankedPlayer | null>(null)
  const metric = (p: RankedPlayer) =>
    tab === 'Collection value'
      ? p.collectionValue || 0
      : tab === 'Highest card'
        ? p.highestCard || 0
        : tab === 'Perfect cards'
          ? p.perfects || 0
          : tab === 'Rarest card'
            ? (p.rarityRank ?? -1)
            : tab === 'Top traders'
              ? p.salesCount || 0
              : p.balance + (p.collectionValue || 0)
  const players = [...view.players]
    .filter(
      (p) =>
        !p.hidden &&
        (period === 'All time' ||
          new Date(p.joined).getUTCFullYear() === new Date().getUTCFullYear()),
    )
    .sort((a, b) => metric(b) - metric(a) || Date.parse(a.joined) - Date.parse(b.joined))
  return (
    <>
      <Title
        title="Every collection leaves a legacy."
        text="Find your place among the collectors. Play for the find, not just the finish."
      >
        <select
          className={`${inputClass} w-auto!`}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label="Leaderboard period"
        >
          <option>All time</option>
          <option>Season 01</option>
        </select>
      </Title>
      <Tabs
        options={[
          'Net worth',
          'Collection value',
          'Highest card',
          'Perfect cards',
          'Rarest card',
          'Top traders',
        ]}
        current={tab}
        set={setTab}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {players.slice(0, 3).map((p, i) => (
          <div
            key={p.id}
            className={`relative rounded-xl border bg-[#19151f] p-6 ${i === 0 ? 'border-[#dcc087]/25' : 'border-white/8'}`}
          >
            <div className="mb-6 flex justify-between">
              <span
                className={`font-display text-3xl ${i === 0 ? 'text-[#dac28b]' : 'text-[#7c648e]'}`}
              >
                0{i + 1}
              </span>
              <Icon
                name="trophy"
                size={22}
                className={i === 0 ? 'text-[#dac28b]' : 'text-[#7c648e]'}
              />
            </div>
            <h3 className="text-sm">
              <button
                onClick={() => setProfile(p)}
                className="transition hover:text-[#c5a5ec]"
                aria-label={`View ${p.name}'s public profile`}
              >
                {p.name}
              </button>
            </h3>
            <p className="mb-4 mt-1 text-[8px] text-[#8f759f]">
              {p.demo ? 'SEEDED / DEMO COLLECTOR' : 'COLLECTOR'}
            </p>
            <div className="font-display text-2xl">
              {tab === 'Rarest card' ? (
                rarities[metric(p)] || 'No cards'
              ) : ['Net worth', 'Collection value', 'Highest card'].includes(tab) ? (
                <Credits value={metric(p)} />
              ) : (
                fmt(metric(p))
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/3 text-[9px] uppercase tracking-wider text-[#8e749f]">
            <tr>
              <th className="p-4">Rank</th>
              <th className="p-4">Collector</th>
              <th className="p-4">Account</th>
              <th className="p-4 text-right">{tab}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr
                key={p.id}
                className={`border-t border-white/5 ${p.id === view.player.id ? 'bg-[#ac8ce9]/5' : ''}`}
              >
                <td className="p-4 text-[#9677ad]">#{i + 1}</td>
                <td className="p-4">
                  <button
                    onClick={() => setProfile(p)}
                    className="text-[#c6acd9] hover:underline"
                    aria-label={`View ${p.name}'s public profile`}
                  >
                    {p.name}
                  </button>
                  {p.id === view.player.id && (
                    <span className="ml-2 text-[8px] text-[#b59ad3]">YOU</span>
                  )}
                </td>
                <td className="p-4">
                  <Tag tone={p.demo ? 'violet' : 'emerald'}>{p.demo ? 'DEMO' : 'COLLECTOR'}</Tag>
                </td>
                <td className="p-4 text-right">
                  {tab === 'Rarest card' ? (
                    rarities[metric(p)] || 'No cards'
                  ) : ['Net worth', 'Collection value', 'Highest card'].includes(tab) ? (
                    <Credits value={metric(p)} />
                  ) : (
                    fmt(metric(p))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-5 rounded-lg border border-white/8 p-4 text-[10px] text-[#9780a7]">
        <summary className="cursor-pointer">How rankings are calculated</summary>
        <p className="mt-3 leading-6">
          Net worth = available credits + reserved trade credits + collection True Value, not asking
          prices or estimated future sales. Burned cards and canceled sales never count. Ties use
          the earliest account creation time. Rarest cards use the 12-standard-rarity ordering;
          Limited cards use their underlying tier. Season 01 includes accounts created this calendar
          year and resets on January 1. Public rankings respect your opt-out preference.
        </p>
      </details>
      {profile && (
        <Modal
          title={`${profile.name}’s vault`}
          subtitle="Public collector profile · no private account information"
          wide
          onClose={() => setProfile(null)}
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tag tone={profile.demo ? 'violet' : 'emerald'}>
              {profile.demo ? 'DEMO COLLECTOR' : 'COLLECTOR'}
            </Tag>
            <span className="text-[10px] text-[#9c83ad]">
              Collecting since {new Date(profile.joined).toLocaleDateString()}
            </span>
          </div>
          <div className="mb-6 grid grid-cols-3 gap-3">
            {[
              { label: 'Collection True Value', value: fmt(profile.collectionValue || 0) },
              { label: 'Perfect Cards', value: fmt(profile.perfects || 0) },
              { label: 'Completed sales', value: fmt(profile.salesCount || 0) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/8 bg-white/2 p-4">
                <p className="text-[8px] text-[#8f769f]">{s.label}</p>
                <p className="mt-2 font-display text-lg">{s.value}</p>
              </div>
            ))}
          </div>
          {view.publicCards.some((c) => c.owner === profile.id) ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {view.publicCards
                .filter((c) => c.owner === profile.id)
                .sort((a, b) => b.snapshot.tv - a.snapshot.tv)
                .map((c) => (
                  <CardTile card={c} key={c.id} />
                ))}
            </div>
          ) : (
            <Empty title="This vault is keeping a little mystery.">
              No cards are publicly visible. The collector may have a private collection.
            </Empty>
          )}
        </Modal>
      )}
    </>
  )
}
export function Updates({ view }: { view: GameView }) {
  const [filter, setFilter] = useState('All updates')
  const updates = view.updates.filter((u) => filter === 'All updates' || u.category === filter)
  return (
    <>
      <Title
        title="The vault keeps evolving."
        text="New possibilities, thoughtful balance changes, and the little details that make collecting better."
      />
      <Tabs
        options={['All updates', 'New Feature', 'Event', 'Balance', 'Fix']}
        current={filter}
        set={setFilter}
      />
      {updates.length ? (
        <div className="max-w-4xl space-y-5">
          {updates.map((u, i) => (
            <article key={u.id} className="rounded-xl border border-white/8 bg-[#19161f] p-6">
              <div className="mb-4 flex items-center gap-3">
                <Tag
                  tone={
                    u.category === 'Balance' ? 'amber' : u.category === 'Fix' ? 'emerald' : 'violet'
                  }
                >
                  {u.category.toUpperCase()}
                </Tag>
                <time className="text-[10px] text-[#816b94]">
                  {new Date(u.publishedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                {i === 0 && filter === 'All updates' && (
                  <span className="ml-auto text-[8px] tracking-widest text-[#ac8bd3]">LATEST</span>
                )}
              </div>
              <h2 className="font-display text-xl">{u.title}</h2>
              <p className="mt-3 text-xs leading-7 text-[#a68ab9]">{u.summary}</p>
              {u.details && (
                <details className="mt-4 border-t border-white/6 pt-4">
                  <summary className="cursor-pointer text-[10px] text-[#c2a0e6]">
                    Read the full update
                  </summary>
                  <p className="mt-4 whitespace-pre-line text-xs leading-7 text-[#9d82b1]">
                    {u.details}
                  </p>
                </details>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty icon="updates" title="No updates in this category.">
          Check back for the next chapter.
        </Empty>
      )}
    </>
  )
}
export function Settings({
  view,
  act,
  busy,
  onAuth,
  onLogout,
}: {
  view: GameView
  act: Act
  busy: boolean
  onAuth: () => void
  onLogout: () => void
}) {
  const [name, setName] = useState(view.player.name),
    [hidden, setHidden] = useState(view.player.hidden || false),
    [notifications, setNotifications] = useState(view.player.notifications ?? true),
    [privateCollection, setPrivate] = useState(view.player.privateCollection || false),
    [limit, setLimit] = useState(view.player.spendLimit ?? 1500)
  return (
    <>
      <Title title="Make yourself at home." text="Your profile, your privacy, your pace." />
      <div className="grid max-w-5xl gap-6 md:grid-cols-[1fr_280px]">
        <form
          className="rounded-xl border border-white/8 bg-[#19161f] p-6"
          onSubmit={(e) => {
            e.preventDefault()
            void act({
              action: 'settings',
              name,
              hidden,
              notifications,
              privateCollection,
              spendLimit: limit,
            })
          }}
        >
          <h2 className="mb-5 font-display text-xl">Collector profile</h2>
          <Field
            label="Public display name"
            hint="2–24 characters. Your email is never shown to other players."
          >
            <input
              className={inputClass}
              required
              minLength={2}
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="my-6 space-y-5 border-y border-white/7 py-6">
            {[
              {
                label: 'Appear on public leaderboards',
                hint: 'Opt out without losing your progress.',
                checked: !hidden,
                set: (v: boolean) => setHidden(!v),
              },
              {
                label: 'Public collection',
                hint: 'Let other collectors request cards in a trade.',
                checked: !privateCollection,
                set: (v: boolean) => setPrivate(!v),
              },
              {
                label: 'In-app notification preference',
                hint: 'Save your preference for future notification delivery.',
                checked: notifications,
                set: setNotifications,
              },
            ].map((s) => (
              <label key={s.label} className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-xs text-[#bfa6d0]">{s.label}</span>
                  <span className="mt-1 block text-[9px] text-[#80678f]">{s.hint}</span>
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#ae8de4]"
                  checked={s.checked}
                  onChange={(e) => s.set(e.target.checked)}
                />
              </label>
            ))}
          </div>
          <h3 className="mb-4 text-sm">Your play controls</h3>
          <Field
            label="Maximum daily slot spending · credits"
            hint="The server enforces this limit. Set to 0 to stop slot spending. Daily limits also apply."
          >
            <input
              className={inputClass}
              type="number"
              min="0"
              max="1000000000000"
              required
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save preferences'}
          </Button>
        </form>
        <div>
          <section className="rounded-xl border border-white/8 bg-[#19161f] p-5">
            <Tag>COLLECTOR ACCOUNT</Tag>
            <h3 className="mb-2 mt-5 font-display text-xl">{view.player.name}</h3>
            <p className="text-[10px] leading-6 text-[#9379a4]">
              Your collection is saved to your account and available wherever you sign in.
            </p>
            {view.preview ? (
              <Button className="mt-5 w-full" onClick={onAuth}>
                Enter the vault
              </Button>
            ) : (
              <>
                <Button variant="secondary" className="mt-5 w-full" onClick={onLogout}>
                  <Icon name="logout" size={15} />
                  Sign out
                </Button>
              </>
            )}
          </section>
          <div className="mt-5 rounded-xl border border-[#bba4e8]/15 p-5 text-[10px] leading-6 text-[#967cac]">
            <Icon name="shield" size={21} className="mb-3 text-[#b695d8]" />
            You’re in control. No deposits, no withdrawals, no real-money value. Enjoy the
            collection at your own pace.
          </div>
        </div>
      </div>
    </>
  )
}
export function AuthForm({
  account,
  onSuccess,
}: {
  account: (a: string, d?: Record<string, unknown>) => Promise<unknown>
  onSuccess: () => void
}) {
  const [mode, setMode] = useState('register'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth') === 'failed') {
      setMode('login')
      setError(
        'The confirmation link could not be completed. Open it in the browser where you registered, or sign in after confirming your email.',
      )
    }
  }, [])
  const submit = async (action: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = (await account(action, { email, password, name })) as {
        confirmationRequired?: boolean
        message?: string
      }
      if (response.confirmationRequired) {
        setMessage(response.message || 'Confirm your email, then sign in.')
        setMode('login')
        setPassword('')
        return
      }
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <p className="mb-5 text-xs leading-6 text-[#a18aae]">
        A place for sharp eyes, lucky finds, and collections with character. Start with 1,250 free
        play credits.
      </p>
      <Tabs options={['register', 'login']} current={mode} set={setMode} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit(mode)
        }}
      >
        {mode === 'register' && (
          <Field label="Display name">
            <input
              className={inputClass}
              value={name}
              required
              minLength={2}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
            />
          </Field>
        )}
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Password · at least 8 characters">
          <input
            className={inputClass}
            type="password"
            minLength={8}
            maxLength={256}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </Field>
        {message && (
          <p role="status" className="mb-4 text-[11px] leading-6 text-emerald-200">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 text-[11px] leading-6 text-rose-300">
            {error}
          </p>
        )}
        <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
          {busy
            ? 'Opening the vault…'
            : mode === 'register'
              ? 'Create collector account'
              : 'Sign in'}
        </Button>
      </form>
      <p className="mt-4 text-[9px] leading-5 text-[#776283]">
        Your progress is saved to your account. No demo access, deposits, withdrawals, or real-money
        features. App accounts cannot access the operator console.
      </p>
    </>
  )
}
export function Guide({ rules }: { rules?: Rules }) {
  return (
    <div className="space-y-5 text-xs leading-7 text-[#a68db7]">
      <p className="text-sm text-[#e2d0ef]">Earn. Open. Discover. Make it yours.</p>
      <p>
        <strong className="text-[#ccb1e1]">1. Start with credits.</strong> New accounts get{' '}
        {rules?.rewards?.starter ?? 1250} play credits. Claim {rules?.rewards?.daily ?? 150} free
        credits daily. Slots are optional, cost {rules?.slots.cost ?? 10} per play, and are capped
        and cooldown-protected.
      </p>
      <p>
        <strong className="text-[#ccb1e1]">2. Know what you’re opening.</strong> Curated standard
        packs contain 3 cards each. Every card always has a rarity and a quality. Grade, one
        mutation, and one special effect are independently chance-based. Standard packs have 12
        rarities; Limited is a separate release category. There are no active Limited crates at
        launch.
      </p>
      <p>
        <strong className="text-[#ccb1e1]">3. Three values. Three different jobs.</strong> True
        Value is the configured attribute calculation. Quick Sell is floor(65% of TV), paid by the
        game when permanently removing a card. PMV is only an estimate from up to 10 comparable
        completed sales in the past 30 days, falling back to TV when there are none.
      </p>
      <p>
        <strong className="text-[#ccb1e1]">4. Chase a Perfect.</strong> Mint Condition + Grade 10 +
        Extraordinary or higher qualifying tier. The +450% increase means 5.5× total—not 4.5×. Grade
        7 is neutral; 1–6 decrease value and 8–10 increase it. Ungraded cards can be assessed once
        at the grading desk. Existing grades cannot be rerolled. No third-party affiliation.
      </p>
      <p>
        <strong className="text-[#ccb1e1]">5. Every modifier has its place.</strong> Base rarity ×
        quality × grade × mutation × effect, then Limited 2×, cumulative additive serial bonuses,
        then Secret 2× or Godly Secret 3×, then Perfect 5.5×, then rounding down once. Sudo-Secret
        has no extra rarity multiplier.
      </p>
      <p>
        <strong className="text-[#ccb1e1]">6. Make a fair exchange.</strong> Market sellers choose
        asking prices and pay a 5% fee on completed sales. Trades reserve assets and require two
        confirmations of the exact revision by registered collectors. Historical seeded collectors
        and transactions remain labeled demo, but simulated trade reviews are disabled.
      </p>
      {rules && (
        <details className="rounded-lg border border-white/10 p-4 text-[10px]">
          <summary className="cursor-pointer text-[#c8a9e5]">
            Complete value reference · formula v{rules.version}
          </summary>
          <div className="mt-4 space-y-5">
            {[
              {
                title: 'Rarity base values · credits',
                entries: rarities.map((r) => [r, fmt(rules.rarity[r])]),
              },
              {
                title: 'Quality multipliers',
                entries: qualities.map((q) => [q, `×${rules.quality[q]}`]),
              },
              {
                title: 'Grade multipliers · optional, no grade = ×1',
                entries: rules.grade.map((g, i) => [`Grade ${i + 1}`, `×${g}`]),
              },
              {
                title: 'Mutation multipliers · optional, No Mutation = ×1',
                entries: mutations
                  .filter((m) => rules.mutation[m] != null)
                  .map((m) => [m, `×${rules.mutation[m]}`]),
              },
              {
                title: 'Special effects · optional, None = ×1',
                entries: Object.entries(rules.effects).map(([name, e]) => [
                  name,
                  `×${e.multiplier}${e.enabled === false || e.archived ? ' · not rolling' : ''}`,
                ]),
              },
            ].map((group) => (
              <div key={group.title}>
                <h3 className="mb-2 font-medium text-[#c6add8]">{group.title}</h3>
                {group.entries.map(([label, value]) => (
                  <p key={label} className="flex justify-between border-b border-white/4 py-1">
                    <span>{label}</span>
                    <span className="font-mono">{value}</span>
                  </p>
                ))}
              </div>
            ))}
            <p>
              Six-decimal fixed-point multipliers, integer credits. Full-precision rational
              arithmetic until one final round down; QSV is floor(TV × 65 / 100).
            </p>
          </div>
        </details>
      )}
      <div className="rounded-lg border border-[#bc9ae7]/15 bg-[#bc9ae7]/4 p-4 text-[10px]">
        The browser never chooses results or balances. Secure random draws happen on the server.
        Atomic, append-only economy commits use unique revisions and idempotency keys. This is a
        small-scale sandbox, not a production-certified or cryptographically provably fair economy.
        There is no card art, real-money wagering, redemption, or cash-out.
      </div>
    </div>
  )
}
