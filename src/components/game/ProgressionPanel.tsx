'use client'
import type { CommandResult, GameCommand, GameView } from '@/game/types'
import { Button, Credits } from './ui'
import { Icon } from './icons'
import { collectorTiers } from '@/game/advancement'

export default function ProgressionPanel({view,busy,act}:{
  view:GameView;busy:boolean;act:(command:Omit<GameCommand,'key'>)=>Promise<CommandResult|null>
}) {
  if (!view.progression) return null
  const active=(view.rules.rewards?.starter??0)>=1250
  return <section className="mb-8 rounded-2xl border border-[#b59bd9]/15 bg-linear-to-br from-[#241a30] to-[#17131e] p-5 sm:p-7">
    {view.progression.advancement && <div className="mb-7 border-b border-white/10 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[9px] tracking-[.2em] text-[#b497d1]">YOUR COLLECTOR JOURNEY</p><h2 className="mt-2 font-display text-3xl">Level {view.progression.advancement.level} · {view.progression.advancement.tier}</h2></div><div className="text-right text-[11px] leading-6 text-[#b8a1ca]"><p>Net worth <Credits value={view.progression.advancement.netWorth}/></p><p>Peak <Credits value={view.progression.advancement.peakWorth}/></p></div></div>
      <progress className="my-4 h-2 w-full accent-[#c2a2e8]" aria-label="Collector level progress" value={view.progression.advancement.xp-view.progression.advancement.levelXp} max={view.progression.advancement.nextXp-view.progression.advancement.levelXp}/>
      <p className="text-[10px] leading-6 text-[#a58ab8]">{view.progression.advancement.xp} / {view.progression.advancement.nextXp} XP · Packs +20, daily +50, jobs +25, grading +15, objectives +40. Casino wagers never farm XP.</p>
      <details className="mt-4 text-[11px] leading-7 text-[#baa0cd]"><summary className="cursor-pointer">Unlock roadmap & net worth rules</summary><p className="my-3 text-[#9e85b1]">Net worth = credits + non-burned card TV + reserved bids, trades, battle entries and active blackjack wagers. Reaching wealth milestones saves them; spending does not relock earned access. Pack price and guaranteed-rarity tiers require both level and peak wealth. Lucky random rarity rolls stay possible at every level; displayed odds never change.</p>{collectorTiers.map(t=><p key={t.name}>{t.name} · Lv {t.level} + {t.worth.toLocaleString()} peak worth · packs up to {t.packPrice===1e12?'any price':t.packPrice.toLocaleString()} · guaranteed pools through {t.rarity}</p>)}</details>
    </div>}
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-[9px] tracking-[.22em] text-[#b497d1]">A LITTLE PROGRESS, EVERY DAY</p><h2 className="font-display text-2xl">Your daily collection circuit.</h2><p className="mt-2 text-[11px] leading-6 text-[#9c86ac]">Objectives reset at 00:00 UTC. Each reward is verified and claimable once.</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3"><Icon name="spark" size={22}/><div><p className="text-lg text-[#e3c8aa]">{view.progression.streak}-day streak</p><p className="text-[9px] text-[#9c86ac]">Consecutive daily claims · +25/day up to +150</p></div></div>
    </div>
    {!active?<p className="text-xs text-amber-100">An operator must activate economy 2.2 to enable objective and streak bonuses.</p>:<div className="grid gap-3 md:grid-cols-3">{view.progression.quests.map(q=><article key={q.id} className="rounded-xl border border-white/[.08] bg-[#100d16]/50 p-4">
      <div className="mb-4 flex items-center justify-between text-[10px] text-[#a78cbd]"><span>{q.progress} / {q.target}</span><Credits value={q.reward}/></div>
      <h3 className="mb-5 text-sm text-[#e1d0ed]">{q.title}</h3>
      <progress aria-label={`${q.title} progress`} className="mb-4 h-1.5 w-full accent-[#b99adf]" value={Math.min(q.progress,q.target)} max={q.target}/>
      <Button className="w-full" variant="secondary" disabled={busy||q.claimed||q.progress<q.target} onClick={()=>void act({action:'claimQuest',quest:q.id})}>{q.claimed?'Reward collected':q.progress>=q.target?'Claim objective reward':'In progress'}</Button>
    </article>)}</div>}
  </section>
}
