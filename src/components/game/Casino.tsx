'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { CommandResult, GameCommand, GameView } from '@/game/types'
import { handValue, plinkoMultipliers } from '@/game/casino'
import { Button, Credits, Empty, Field, fmt, Tag } from './ui'
import { Slots } from './screens'

const input = 'w-full rounded-lg border border-white/10 bg-[#100e17] px-3 py-3 text-xs text-[#e2d8ed] outline-none focus:border-[#b59aec]'
const panel = 'rounded-2xl border border-white/10 bg-[#19151f] p-5 sm:p-7'
type Props = { view: GameView; busy: boolean; act: (command: Omit<GameCommand, 'key'>) => Promise<CommandResult | null> }
const modes = { highest: 'Highest total', lowest: 'Lowest total', shared: 'Shared opening', 'final-round': 'Final round wins' }
export default function Casino(props: Props) {
  const { view, busy, act } = props
  const [tab, setTab] = useState('Pack battles')
  const [bet, setBet] = useState(10), [result, setResult] = useState('')
  const [packs, setPacks] = useState<string[]>([]), [seats, setSeats] = useState(2)
  const [mode, setMode] = useState('highest'), [search, setSearch] = useState('')
  const [history, setHistory] = useState(false), [confirmed, setConfirmed] = useState(false)
  const eligible = view.packs.filter(p => p.enabled && !p.limited && p.stock == null &&
    !p.perPlayerLimit && !p.perPlayerDailyLimit && !p.maxDistinctPlayers && !p.cooldownSeconds &&
    (!p.starts || Date.parse(p.starts) <= (view.serverTime ?? Date.now())) &&
    (!p.ends || Date.parse(p.ends) > (view.serverTime ?? Date.now())))
  const cost = packs.reduce((n, id) => n + (eligible.find(p => String(p.id) === id)?.price ?? 0), 0)
  const battles = (view.casino?.battles ?? []).filter(b => (history ? b.status !== 'waiting' : b.status === 'waiting') &&
    `${b.id} ${view.players.find(p => p.id === b.host)?.name} ${b.packs.map(p => p.name).join(' ')}`.toLowerCase().includes(search.toLowerCase()))
  const hand = view.casino?.hand
  const play = async (action: string) => {
    const response = await act({ action, bet })
    if (response) setResult(response.message)
  }
  return <>
    <div className="mb-8 rounded-2xl border border-[#d1b679]/20 bg-linear-to-br from-[#2b2231] via-[#1b1722] to-[#141119] p-6 sm:p-9">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Tag tone="amber">THE VAULT / SOCIAL CLUB</Tag><span className="text-[10px] text-[#ae96ba]">PLAY CREDITS ONLY · NO DEPOSITS OR CASH-OUTS</span></div>
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">A seat at the table.</h1>
      <p className="mt-4 max-w-2xl text-xs leading-7 text-[#aa96b7]">Open together. Compare your luck. Every entry, draw and award is committed by the server, with a receipt that survives a refresh.</p>
      <div className="mt-6 flex flex-wrap gap-5 border-t border-white/8 pt-5 text-[10px] text-[#c4a9d7]"><span>Today’s casino entries: <Credits value={view.casino?.spent ?? 0}/></span><span>Spending control: <Credits value={view.player.spendLimit ?? 1500}/></span><Link href="/settings" className="underline">Manage play limits</Link><Link href="/earn" className="underline">Prefer guaranteed earnings?</Link></div>
    </div>
    <div role="tablist" aria-label="Casino games" className="mb-7 flex gap-2 overflow-x-auto">{['Pack battles', 'Blackjack', 'Plinko', 'Slots'].map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setResult(''); setConfirmed(false) }} className={`whitespace-nowrap rounded-lg border px-5 py-3 text-xs ${tab === t ? 'border-[#baa0dd]/40 bg-[#baa0dd]/15 text-[#ecdcfa]' : 'border-white/8 text-[#9683a8]'}`}>{t}</button>)}</div>
    {tab === 'Slots' ? <Slots {...props}/> : tab === 'Pack battles' ? <>
      <div className="mb-7 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <section className={panel}>
          <p className="mb-2 text-[9px] tracking-[.2em] text-[#a58cb8]">01 / BUILD YOUR BATTLE</p><h2 className="mb-5 font-display text-2xl">Your packs. Your rules.</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Player seats"><select className={input} value={seats} onChange={e => { setSeats(Number(e.target.value)); setConfirmed(false) }}>{[2,3,4].map(n => <option key={n} value={n}>{n} players</option>)}</select></Field>
            <Field label="Game mode"><select className={input} value={mode} onChange={e => { setMode(e.target.value); setConfirmed(false) }}>{Object.entries(modes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          </div>
          <Field label="Add a pack round · maximum 10"><select className={input} value="" disabled={packs.length >= 10} onChange={e => { if(e.target.value) setPacks(p => [...p,e.target.value]); setConfirmed(false) }}><option value="">Choose an unlimited standard pack…</option>{eligible.map(p => <option key={p.id} value={String(p.id)} disabled={!!p.lockedReason}>{p.name} · {fmt(p.price)}{p.lockedReason ? ` · ${p.lockedReason}` : ''}</option>)}</select></Field>
          <ol className="my-4 space-y-2">{packs.map((id, i) => <li key={`${id}:${i}`} className="flex items-center justify-between rounded-lg border border-white/8 px-3 py-2 text-xs text-[#c8b1d8]"><span>{String(i + 1).padStart(2,'0')} / {eligible.find(p => String(p.id) === id)?.name ?? 'Unavailable pack'}</span><button aria-label={`Remove round ${i+1}`} onClick={() => { setPacks(p => p.filter((_, n) => n !== i)); setConfirmed(false) }} className="px-2 py-1 text-[#a18bb1]">Remove</button></li>)}</ol>
          <label className="my-5 flex items-start gap-3 text-[11px] leading-6 text-[#aa94bc]"><input className="mt-1 accent-[#baa0dd]" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>I reserve {fmt(cost)} credits. {mode === 'shared' ? 'Each participant keeps their own cards.' : `${modes[mode as keyof typeof modes]} receives the card pool; tied winners share cards, not guaranteed equal value.`} The lobby refunds all entries if canceled or unfilled after ten minutes. Refunded entries still count toward daily spending.</span></label>
          <Button className="w-full" disabled={busy || !packs.length || !confirmed || cost > view.player.balance || packs.some(id => !eligible.some(p => String(p.id) === id && !p.lockedReason))} onClick={() => void act({ action:'createBattle', packs, seats, mode, expectedPrice:cost, expectedCatalog:view.catalogRevision }).then(r => { if(r) {setPacks([]);setConfirmed(false)} })}>Create joinable lobby · <Credits value={cost}/></Button>
        </section>
        <aside className={`${panel} flex flex-col justify-center`}>
          <p className="mb-3 text-[9px] tracking-[.2em] text-[#c5ad82]">02 / SAME PACKS. SAME ODDS.</p><h2 className="font-display text-3xl">The reveal is shared.<br/>The result is permanent.</h2>
          <div className="mt-6 space-y-4 text-xs leading-7 text-[#a68eb8]"><p>Everyone opens the identical saved pack lineup. Highest / lowest uses the full True Value total; final-round uses only the last round. Shared mode lets each player keep their own pulls.</p><p>No NPC fill, hidden house fee or client-selected results. Limited and stock-limited releases are excluded. Pack edits cannot change a waiting lobby’s saved terms.</p><p>A battle settles only once, when the last player joins. You can leave the page and find the result in your battle history.</p></div>
        </aside>
      </div>
      <div className="mb-5 flex flex-wrap gap-3"><Button variant={!history?'primary':'ghost'} onClick={()=>setHistory(false)}>Join a lobby</Button><Button variant={history?'primary':'ghost'} onClick={()=>setHistory(true)}>My battle history</Button><input aria-label="Search battles" placeholder="Search host, packs or lobby ID…" value={search} onChange={e=>setSearch(e.target.value)} className={`${input} sm:ml-auto sm:max-w-80`}/></div>
      {!battles.length ? <Empty title={history?'Your first battle is still ahead.':'The floor is open.'}>Create a lobby, choose your lineup and invite other collectors to join.</Empty> : <div className="grid gap-4 xl:grid-cols-2">{battles.map(b=><article key={b.id} className={panel}>
        <div className="mb-4 flex justify-between gap-3"><Tag>{modes[b.mode]}</Tag><span className="text-[10px] text-[#9d86b0]">{b.status.toUpperCase()} · {b.players.length}/{b.seats}</span></div>
        <h3 className="font-display text-xl">{view.players.find(p=>p.id===b.host)?.name??'Collector'}’s table</h3><p className="my-3 text-xs leading-6 text-[#a58db7]">{b.packs.map(p=>p.name).join(' / ')}</p><p className="mb-4 break-all font-mono text-[9px] text-[#7f6b91]">LOBBY {b.id}</p>
        {b.status==='waiting'?<><p className="mb-4 text-[10px] text-[#a58db7]">Unfilled entry expires at {new Date(b.expiresAt).toLocaleTimeString()} · full automatic refund on next server sync.</p><div className="flex flex-wrap items-center gap-3"><Credits value={b.cost}/>{b.host===view.player.id?<Button variant="secondary" disabled={busy} onClick={()=>void act({action:'cancelBattle',battle:b.id})}>Cancel & refund</Button>:<Button disabled={busy||b.players.includes(view.player.id)||b.cost>view.player.balance} onClick={()=>{if(window.confirm(`Reserve ${fmt(b.cost)} credits for ${modes[b.mode]}? ${b.mode==='shared'?'Keep your own pulls.':'You may lose your entire entry; ties share cards.'} Unfilled lobbies refund after ten minutes. Refunded entries still count toward spending limits.`))void act({action:'joinBattle',battle:b.id,expectedPrice:b.cost})}}>{b.players.includes(view.player.id)?'Your seat is reserved':'Join battle'}</Button>}</div></>:<div className="space-y-3">{b.scores?.map(s=><div key={s.player} className="rounded-lg border border-white/8 p-3 text-xs"><div className="flex justify-between gap-3"><span className="text-[#c8b1d8]">{view.players.find(p=>p.id===s.player)?.name??'Collector'}{b.winners?.includes(s.player)?' · WINNER':''}</span><Credits value={s.total}/></div><p className="mt-2 break-words text-[9px] text-[#9e86b0]">Round TV: {s.rounds.map(fmt).join(' / ')}</p></div>)}{b.status==='cancelled'&&<p className="text-xs text-[#a58db7]">All entries returned.</p>}<Link className="inline-block text-xs text-[#cfb2ec] underline" href="/collection">View awarded cards</Link></div>}
      </article>)}</div>}
    </> : <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className={`${panel} min-h-100`}>
        <Tag tone="amber">{tab === 'Blackjack' ? 'DEALER STANDS ON ALL 17s' : '8 ROWS / ONE SERVER-COMMITTED DROP'}</Tag>
        <h2 className="my-6 font-display text-3xl">{tab === 'Blackjack' ? 'Twenty-one. Nothing more.' : 'A different path, every time.'}</h2>
        {tab === 'Blackjack' ? <div className="space-y-6">
          {(['dealer','player'] as const).map(side=><div key={side}><p className="mb-3 text-[10px] uppercase tracking-widest text-[#9b84b0]">{side === 'player' ? 'Your hand' : 'Dealer'}{hand && (side==='player'||hand.status!=='playing') ? ` · ${handValue(hand[side])}`:''}</p><div className="flex flex-wrap gap-2">{(hand?.[side]??['—','—']).map((card,i)=><span key={i} className="flex h-20 w-14 items-center justify-center rounded-lg border border-[#c7a7e6]/25 bg-[#251c30] font-mono text-lg text-[#e0c9f4]">{card}</span>)}</div></div>)}
          {hand&&<p className="text-xs text-[#ccb1df]">{hand.status.toUpperCase()} · wager {fmt(hand.bet)}{hand.status!=='playing'?` · returned ${fmt(hand.payout)}`:''}</p>}
          {hand?.status==='playing'&&<div className="flex gap-3"><Button disabled={busy} onClick={()=>void act({action:'blackjackHit',hand:hand.id})}>Hit</Button><Button variant="secondary" disabled={busy} onClick={()=>void act({action:'blackjackStand',hand:hand.id})}>Stand</Button></div>}
        </div>:<><div aria-hidden="true" className="space-y-3 rounded-xl border border-white/8 bg-black/15 p-5 font-mono text-center text-sm tracking-[.5em] text-[#9e87b9]">{Array.from({length:8},(_,i)=><p key={i}>{Array.from({length:i+1},()=> '·').join(' ')}</p>)}</div><div className="my-4 grid grid-cols-9 gap-1">{plinkoMultipliers.map((m,i)=><span key={i} className={`rounded px-0.5 py-3 text-center font-mono text-[9px] ${i===0||i===8?'bg-[#b89b68]/20 text-[#e2c58f]':'bg-[#a98bcb]/10 text-[#bca1d6]'}`}>{m}×</span>)}</div></>}
        <p role="status" className="mt-6 text-xs leading-7 text-[#c8afd9]">{result || 'Choose a wager and review the rules before playing.'}</p>
      </section>
      <section className={panel}><h3 className="mb-5 font-display text-xl">Play on your terms.</h3><Field label="Wager · 10–1,000 whole credits"><input className={input} type="number" min={10} max={1000} step={1} value={bet} onChange={e=>{setBet(Number(e.target.value));setConfirmed(false)}}/></Field>
        <p className="my-5 text-xs leading-7 text-[#a48bb7]">{tab==='Blackjack'?'One shuffled 52-card deck per hand. Blackjack pays 3:2 (half credits round down), ordinary wins 1:1, a push returns your wager. Aces count as 1 or 11. No splits, doubles or insurance. Your open hand survives refreshes.':'Each row has an independent 50% left/right chance. Bin probabilities left to right: 1, 8, 28, 56, 70, 56, 28, 8, 1 out of 256. Average return is 92.1875% of the wager before integer rounding. There is no guaranteed profit.'}</p>
        <label className="mb-5 flex items-start gap-3 text-[11px] leading-6 text-[#aa94bc]"><input className="mt-1 accent-[#baa0dd]" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I understand the rules and that I can lose credits. These credits have no cash value.</label>
        <Button className="w-full" disabled={busy||!confirmed||!Number.isSafeInteger(bet)||bet<10||bet>1000||view.player.balance<bet||(tab==='Blackjack'&&hand?.status==='playing')} onClick={()=>void play(tab==='Blackjack'?'blackjack':'plinko')}>{tab==='Blackjack'?'Deal a hand':'Drop one ball'} · <Credits value={bet}/></Button>
        <p className="mt-4 text-[10px] leading-6 text-[#8d759f]">Blackjack + Plinko: {view.casino?.plays??0} / 100 daily plays. All casino entries share your spending control, including pack battles and slots. Stop at any time.</p>
      </section>
    </div>}
  </>
}
