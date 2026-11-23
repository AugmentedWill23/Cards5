'use client'
import { useDeferredValue, useMemo, useState } from 'react'
import { rarities } from '@/game/rules'
import type { Card } from '@/game/types'
import { Button } from './ui'

const input = 'rounded-lg border border-white/10 bg-[#100e17] px-3 py-3 text-xs text-[#d5c3e4] outline-none focus:border-[#b59aec]'
export function useCardBrowser(source: Card[], label: string) {
  const [search, setSearch] = useState(''), [rarity, setRarity] = useState('')
  const [sort, setSort] = useState('newest'), [limit, setLimit] = useState(48)
  const [attribute, setAttribute] = useState('')
  const query = useDeferredValue(search.toLowerCase().trim())
  const filtered = useMemo(() => source.filter(c =>
    (!rarity || c.attributes.rarity === rarity) &&
    (!attribute || (attribute === 'perfect' ? c.snapshot.perfect : attribute === 'limited' ? c.attributes.limited :
      attribute === 'mutation' ? !!c.attributes.mutation : attribute === 'effect' ? !!c.attributes.effect : c.attributes.grade == null)) &&
    `${c.name} ${c.id} ${c.source} ${c.attributes.quality} ${c.attributes.mutation??''} ${c.attributes.effect??''} ${c.serial??''} ${c.attributes.serial??''}`.toLowerCase().includes(query))
    .sort((a,b) => sort==='high' ? b.snapshot.tv-a.snapshot.tv : sort==='low' ? a.snapshot.tv-b.snapshot.tv :
      sort==='name' ? a.name.localeCompare(b.name) : Date.parse(b.createdAt)-Date.parse(a.createdAt)),
    [source, query, rarity, sort, attribute])
  const reset = () => {setSearch('');setRarity('');setAttribute('');setSort('newest');setLimit(48)}
  const controls = <div className="mb-5 rounded-xl border border-white/8 bg-black/10 p-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <input className={input} aria-label={`Search ${label}`} placeholder="Name, ID, finish, effect, serial…" value={search} onChange={e=>{setSearch(e.target.value);setLimit(48)}}/>
      <select className={input} aria-label={`${label} rarity`} value={rarity} onChange={e=>{setRarity(e.target.value);setLimit(48)}}><option value="">All rarities</option>{rarities.map(r=><option key={r}>{r}</option>)}</select>
      <select className={input} aria-label={`${label} attribute`} value={attribute} onChange={e=>{setAttribute(e.target.value);setLimit(48)}}><option value="">All attributes</option><option value="perfect">Perfect</option><option value="limited">Limited</option><option value="mutation">Has mutation</option><option value="effect">Has effect</option><option value="ungraded">Ungraded</option></select>
      <select className={input} aria-label={`Sort ${label}`} value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="high">Highest True Value</option><option value="low">Lowest True Value</option><option value="name">Name A–Z</option></select>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-[#a58ab8]"><span>{Math.min(limit,filtered.length)} shown / {filtered.length} matches / {source.length} cards</span><button onClick={reset} className="underline">Reset filters</button>{filtered.length>limit&&<Button variant="ghost" onClick={()=>setLimit(n=>n+48)}>Show 48 more</Button>}</div>
  </div>
  return { cards: filtered.slice(0,limit), controls }
}
