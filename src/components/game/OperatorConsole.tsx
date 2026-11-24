'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Rules } from '@/game/rules'
import { rarities } from '@/game/rules'
import type { GameCommand } from '@/game/types'
import { readJson } from '@/lib/fetch-json'
import { Icon } from './icons'
import { Button, CardTile, Credits, Field } from './ui'
import { AttributeDefaults, CardStudioEditor, CaseStudioEditor, previewCard, StudioNumber, StudioSelect, StudioText, type StudioRow } from './StudioEditors'

type StudioData = {
  authorized:boolean; role?:string; passwordRequired?:boolean; releasedEditing?:boolean
  cases:StudioRow[]; designs:StudioRow[]; configurations:StudioRow[]; rules?:Rules; players:StudioRow[]
}
type PendingGrant = { signature:string; command:GameCommand }
const tabs=['Overview','Card studio','Packs & cases','Player support','Economy update']
const panel='rounded-2xl border border-white/10 bg-[#19151f] p-5 sm:p-7'
export default function OperatorConsole() {
  const [data,setData]=useState<StudioData|null>(null)
  const [tab,setTab]=useState('Overview'),[search,setSearch]=useState('')
  const [designFilter,setDesignFilter]=useState(''),[caseFilter,setCaseFilter]=useState('')
  const [reason,setReason]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [fields,setFields]=useState<Record<string,string>>({})
  const [design,setDesign]=useState<StudioRow|null>(null),[pack,setPack]=useState<StudioRow|null>(null)
  const [designKey,setDesignKey]=useState(0),[packKey,setPackKey]=useState(0)
  const [target,setTarget]=useState(''),[operation,setOperation]=useState('grantCurrency')
  const [amount,setAmount]=useState<number|null>(250),[quantity,setQuantity]=useState<number|null>(1)
  const [grantDesign,setGrantDesign]=useState(''),[attributes,setAttributes]=useState<StudioRow>({})
  const [pending,setPending]=useState<PendingGrant|null>(null),[preview,setPreview]=useState<StudioRow|null>(null)
  const load=useCallback(async()=>{
    const response=await fetch('/api/operator',{cache:'no-store'}),body=await readJson(response)
    if(!response.ok)throw new Error(body.error||'The operator workspace is unavailable.')
    setData(body)
  },[])
  useEffect(()=>{void load().catch(e=>setError(e.message));try{setPending(JSON.parse(sessionStorage.getItem('vault-support-pending')||'null'))}catch{sessionStorage.removeItem('vault-support-pending')}},[load])
  const editable=['owner','operator','economy'].includes(data?.role??'')
  const post=async(input:StudioRow)=>{
    const response=await fetch('/api/operator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,reason,password})})
    const result=await readJson(response)
    if(!response.ok){
      setFields(result.fieldErrors??{})
      throw Object.assign(new Error(result.error||'The operation failed.'),{status:response.status})
    }
    return result
  }
  async function work(task:()=>Promise<void>){
    setBusy(true);setError('');setNotice('');setFields({})
    try{await task()}catch(e){setError(e instanceof Error?e.message:'Unable to complete this action.')}finally{setBusy(false)}
  }
  async function save(action:string,record:StudioRow|null,input:StudioRow,pool:StudioRow[]=[]){
    await work(async()=>{
      const result=await post({action,id:record?.id??null,revision:record?.revision??null,data:input,pool})
      await load()
      if(action==='saveDesign')setDesign(result.record)
      else setPack({...result.record,pool})
      setNotice('Saved in Supabase. Owned cards and previous transaction snapshots were not rewritten.')
    })
  }
  const selectedPlayer=data?.players?.find(p=>p.id===target)
  const selectedDesign=data?.designs?.find(d=>d.id===grantDesign)
  let grantPreview=null
  try{if(selectedDesign&&data?.rules)grantPreview=previewCard({...selectedDesign,default_attributes:{...attributes,...selectedDesign.default_attributes}},data.rules)}catch{}
  async function support(retry?:PendingGrant){
    await work(async()=>{
      if(confirmation!=='CONFIRM')throw new Error('Type CONFIRM to authorize the exact grant.')
      const body={action:'admin',operation,target,amount,design:grantDesign,designRevision:selectedDesign?.revision,quantity,attributes,reason,confirmation:'CONFIRM'}
      const signature=JSON.stringify(body)
      if(pending&&!retry&&pending.signature!==signature)throw new Error('Resolve the pending grant by retrying it before creating a different grant.')
      const grant=retry??pending??{signature,command:{...body,key:crypto.randomUUID()}}
      sessionStorage.setItem('vault-support-pending',JSON.stringify(grant));setPending(grant)
      try{
        const result=await post({action:'command',command:grant.command})
        sessionStorage.removeItem('vault-support-pending');setPending(null);setConfirmation('')
        await load();setNotice(result.result.message)
      }catch(e){
        if((e as {status?:number}).status===400 || (e as {status?:number}).status===403){
          sessionStorage.removeItem('vault-support-pending');setPending(null)
        }
        throw e
      }
    })
  }
  const visibleDesigns=(data?.designs??[]).filter(d=>(!designFilter||d.rarity===designFilter)&&`${d.name} ${d.slug} ${d.rarity} ${d.availability} ${d.default_attributes?.mutation??''} ${d.default_attributes?.effect??''}`.toLowerCase().includes(search.toLowerCase()))
  const visibleCases=(data?.cases??[]).filter(p=>(!caseFilter||p.status===caseFilter)&&`${p.name} ${p.slug} ${p.status} ${p.kind}`.toLowerCase().includes(search.toLowerCase()))
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-7 sm:px-7 sm:py-10">
    <div className="mb-9 flex flex-wrap items-center justify-between gap-5">
      <div><Link href="/" className="text-[11px] text-[#aa90c1]">← Return to your vault</Link><p className="mb-2 mt-7 text-[9px] font-semibold tracking-[.24em] text-[#aa8bcd]">VAULT / CONTROL ROOM</p><h1 className="font-display text-3xl tracking-tight sm:text-4xl">Operator console</h1><p className="mt-3 text-xs leading-6 text-[#8e7b9e]">Create with intention. Publish with confidence. Every economic change is server-verified.</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-[#b49bd4]/15 bg-[#1a1523] px-4 py-3 text-[10px] text-[#bea7d7]"><Icon name="shield" size={18}/>{data?.authorized?`${data.role?.toUpperCase()} · SUPABASE`:'PROTECTED WORKSPACE'}</div>
    </div>
    {error&&<div role="alert" className="mb-5 rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-xs leading-6 text-rose-200">{error}{Object.entries(fields).map(([key,value])=><p key={key}>{key.replaceAll('_',' ')}: {value}</p>)}</div>}
    {notice&&<p role="status" className="mb-5 rounded-xl border border-emerald-200/15 bg-emerald-200/5 p-4 text-xs leading-6 text-emerald-100">{notice}</p>}
    {!data?<p className="text-sm text-[#9c87ad]">Checking Supabase permissions…</p>:!data.authorized?<div className={panel}><h2 className="mb-3 font-display text-xl">A trusted identity is required.</h2><p className="max-w-2xl text-sm leading-7 text-[#9c87ad]">Sign in to the game with an account explicitly assigned a Supabase operator role. Public signup never grants staff permissions. Legacy Payload CMS identities do not grant access here.</p></div>:!data.rules?<p className="text-sm text-amber-100">Publish an active Supabase configuration to unlock the studio.</p>:<>
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['Card designs',data.designs.length],['Published cases',data.cases.filter(c=>c.status==='published').length],
        ['Collectors',data.players.length],['Economy version',data.rules.version],
      ].map(([label,value])=><div key={label} className="rounded-xl border border-white/[.07] bg-[#19151f] px-5 py-4"><p className="text-[9px] tracking-wider text-[#8e7b9e]">{label}</p><p className="mt-2 font-display text-2xl text-[#e4d5f3]">{value}</p></div>)}</div>
      <div className="mb-7 flex gap-1 overflow-x-auto rounded-xl border border-white/[.07] bg-[#141119] p-1.5" role="tablist" aria-label="Operator sections">{tabs.map(t=><button key={t} role="tab" aria-selected={tab===t} onClick={()=>{setTab(t);setSearch('')}} className={`whitespace-nowrap rounded-lg px-4 py-3 text-[11px] transition ${tab===t?'bg-[#b59bdc]/15 text-[#e1ccef]':'text-[#8e7b9e] hover:bg-white/5'}`}>{t}</button>)}</div>
      <section className="mb-7 grid gap-x-5 rounded-xl border border-white/[.07] bg-[#17121f] px-5 pt-5 md:grid-cols-2">
        <StudioText label="Audit reason · required for all writes" value={reason} onChange={setReason} maxLength={2000}/>
        {data.passwordRequired?<StudioText label="Private operator password" type="password" value={password} onChange={setPassword}/>:<p className="pb-4 text-[10px] leading-6 text-[#8f7a9e]">Identity and roles are verified on every operation. Credits, outcomes, limits and publication fields are never trusted from a public browser.</p>}
      </section>
      {tab==='Card studio'&&<div className="max-w-80"><StudioSelect label="Filter card designs by rarity" value={designFilter} onChange={setDesignFilter}><option value="">All rarities</option>{rarities.map(r=><option key={r}>{r}</option>)}</StudioSelect></div>}
      {tab==='Packs & cases'&&<div className="max-w-80"><StudioSelect label="Filter packs by status" value={caseFilter} onChange={setCaseFilter}><option value="">All publication states</option>{['draft','published','paused','archived'].map(s=><option key={s}>{s}</option>)}</StudioSelect></div>}
      <div hidden={tab!=='Overview'} className="grid gap-5 lg:grid-cols-2">
        <section className={panel}><p className="mb-3 text-[9px] tracking-[.2em] text-[#a889c5]">DESIGN → REVIEW → RELEASE</p><h2 className="mb-4 font-display text-2xl">Your collection, curated.</h2><p className="mb-6 text-xs leading-7 text-[#a48fb7]">Build named cards with guaranteed attributes and immutable mint-time bases. Curate assigned pools or tune ordinary rarity packs. With the released-pack SQL upgrade, edit future opening terms while preserving all owned cards, serials, receipts and player-use counters.</p><div className="flex flex-wrap gap-3"><Button onClick={()=>setTab('Card studio')}>Open card studio</Button><Button variant="secondary" onClick={()=>setTab('Packs & cases')}>Build a pack</Button></div></section>
        <section className={panel}><h2 className="mb-4 font-display text-xl">Active configurations</h2>{data.configurations.map(c=><div key={c.id} className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[.06] p-3"><Link href={`/operator-preview?kind=configuration&id=${encodeURIComponent(c.id)}`} className="text-xs text-[#cbb3e2] underline">{c.name}</Link><span className="text-[10px] text-[#9e88ae]">{c.version} · {c.active?'ACTIVE':c.status}</span></div>)}<p className="mt-5 text-[10px] leading-6 text-[#927aa4]">The economy update publishes a new configuration without rewriting historical value rules. Preview the one-time player top-up before activating.</p></section>
      </div>
      <div hidden={tab!=='Card studio'} className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className={panel}><Button className="mb-5 w-full" disabled={!editable} onClick={()=>{setDesign(null);setDesignKey(k=>k+1)}}>New card design</Button><StudioText label="Search card designs" value={search} onChange={setSearch}/><div className="max-h-[600px] space-y-1 overflow-y-auto">{visibleDesigns.map(d=><button key={d.id} onClick={()=>setDesign(d)} className={`w-full rounded-lg px-3 py-3 text-left ${design?.id===d.id?'bg-[#b79bd9]/10':'hover:bg-white/4'}`}><p className="truncate text-xs text-[#d5c1e5]">{d.name}</p><p className="mt-1 text-[9px] text-[#8d789e]">{d.rarity} · {d.enabled?d.availability:'disabled'}</p></button>)}</div></aside>
        <section className={panel}><CardStudioEditor key={designKey} record={design} rules={data.rules} busy={busy} canEdit={editable} save={save}/></section>
      </div>
      <div hidden={tab!=='Packs & cases'} className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className={panel}><Button className="mb-3 w-full" disabled={!editable} onClick={()=>{setPack(null);setPackKey(k=>k+1)}}>New pack / case</Button>
          {pack&&<Button variant="secondary" className="mb-5 w-full" disabled={!editable} onClick={()=>{setPack({...pack,id:undefined,revision:undefined,first_opened_at:null,name:`${pack.name} Copy`,slug:`${pack.slug}-copy`,serial_scope:pack.kind==='limited'?`${pack.serial_scope}-copy`:null,status:'draft'});setPackKey(k=>k+1)}}>Clone as new release</Button>}
          <StudioText label="Search packs and cases" value={search} onChange={setSearch}/><div className="max-h-[600px] space-y-1 overflow-y-auto">{visibleCases.map(p=><button key={p.id} onClick={()=>setPack(p)} className={`w-full rounded-lg px-3 py-3 text-left ${pack?.id===p.id?'bg-[#b79bd9]/10':'hover:bg-white/4'}`}><p className="truncate text-xs text-[#d5c1e5]">{p.name}</p><p className="mt-1 text-[9px] text-[#8d789e]">{p.price.toLocaleString()} · {p.status} · {p.pool_mode}</p></button>)}</div>
        </aside>
        <section className={panel}><CaseStudioEditor key={packKey} record={pack} rules={data.rules} busy={busy} canEdit={editable} save={save} designs={data.designs} configurations={data.configurations} releasedEditing={data.releasedEditing}/></section>
      </div>
      <div hidden={tab!=='Player support'} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className={panel}><h2 className="mb-3 font-display text-2xl">A precise, permanent grant.</h2><p className="mb-6 text-xs leading-7 text-[#9882aa]">Search by public player name or ID. Grants use the same authoritative commit as purchases. Limited cards must be earned through their published release, never invented by support.</p>
          <StudioText label="Search players" value={search} onChange={setSearch}/>
          <StudioSelect label="Target collector" value={target} onChange={setTarget}><option value="">Choose a collector…</option>{data.players.filter(p=>`${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase())).map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</StudioSelect>
          {selectedPlayer&&<div className="mb-5 rounded-lg border border-white/10 p-4 text-xs text-[#bca6cd]"><p className="break-all">{selectedPlayer.name} · {selectedPlayer.id}</p><p className="mt-2">{selectedPlayer.balance.toLocaleString()} credits · {selectedPlayer.cards} cards{selectedPlayer.suspended?' · suspended':''}</p></div>}
          <StudioSelect label="Support operation" value={operation} onChange={setOperation}><option value="grantCurrency">Add credits</option><option value="grantCard">Add cards</option></StudioSelect>
          {operation==='grantCurrency'?<StudioNumber label="Credits to add" min={1} value={amount} onChange={setAmount}/>:<>
            <StudioSelect label="Card design to grant" value={grantDesign} onChange={setGrantDesign}><option value="">Choose an enabled design…</option>{data.designs.filter(d=>d.enabled&&d.availability!=='limited-only').map(d=><option key={d.id} value={d.id}>{d.name} · {d.rarity}</option>)}</StudioSelect>
            <StudioNumber label="Number of cards" min={1} max={50} value={quantity} onChange={setQuantity}/>
            <AttributeDefaults support rules={data.rules} value={attributes} onChange={setAttributes}/>
            <p className="mb-5 text-[10px] leading-6 text-[#927aa4]">Design guarantees take priority. Unspecified support attributes are neutral; no random outcome is rolled for a grant.</p>
          </>}
          <StudioText label="Type CONFIRM to authorize this grant" value={confirmation} onChange={setConfirmation}/>
          <Button disabled={busy||!editable||confirmation!=='CONFIRM'||reason.trim().length<5||!target||(operation==='grantCard'&&!grantDesign)} onClick={()=>void support()}>{operation==='grantCurrency'?'Commit credit grant':'Commit card grant'}</Button>
          {pending&&<div className="mt-5 rounded-lg border border-amber-200/15 p-4 text-xs leading-6 text-amber-100"><p>A grant is unconfirmed. Do not create another key; retrying this exact request is safe.</p><Button variant="secondary" className="mt-3" disabled={busy||confirmation!=='CONFIRM'} onClick={()=>void support(pending)}>Retry pending grant</Button></div>}
        </section>
        <aside className={panel}><p className="mb-5 text-[9px] tracking-[.2em] text-[#a889c5]">GRANT PREVIEW</p>{operation==='grantCurrency'?<><p className="mb-3 text-xs text-[#a48fb7]">Add to the existing balance</p><Credits value={amount??0} className="text-3xl"/><p className="mt-4 text-[10px] leading-6 text-[#927aa4]">No balance reset, escrow release or ownership change. Existing transaction history is preserved.</p></>:grantPreview?<CardTile card={grantPreview}/>:<p className="text-xs leading-6 text-[#927aa4]">Choose a design to preview the exact granted attributes and custom base.</p>}</aside>
      </div>
      <section hidden={tab!=='Economy update'} className={panel}>
        <p className="mb-3 text-[9px] tracking-[.2em] text-[#a889c5]">PROGRESSION RELEASE / 2.2.0</p><h2 className="mb-4 font-display text-2xl">More ways to build your vault.</h2>
        <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['New collector grant','1,250'],['Daily reward','150 + streak'],['Sorting jobs','40 / 30 seconds'],['New packs','500 & 2,500']].map(([label,value])=><div key={label} className="rounded-xl border border-white/[.07] bg-[#100d16] p-4"><p className="text-[10px] text-[#8e789f]">{label}</p><p className="mt-2 font-display text-lg text-[#dfcbed]">{value}</p></div>)}</div>
        <p className="mb-5 max-w-3xl text-xs leading-7 text-[#a48fb7]">Preserve every current balance, card, trade, bid and historical snapshot. Existing real collectors receive max(0, 1,250 − recorded original welcome grant) + 250 once. Missing or ambiguous welcome records are flagged for manual review. No money is guessed or reset.</p>
        <Button variant="secondary" disabled={busy||!editable} onClick={()=>void work(async()=>{setPreview((await post({action:'previewEconomy'})).preview)})}>Preview verified player upgrade</Button>
        {preview&&<div className="mt-7">
          {preview.applied?<p role="status" className="text-sm text-emerald-200">This upgrade was already applied. No duplicate grant will be made.</p>:<>
            <div className="mb-5 flex flex-wrap gap-5 text-xs text-[#d4bfe7]"><span>{preview.eligible} eligible collectors</span><span>{preview.total.toLocaleString()} credits to add</span><span>{preview.reviewRequired} need review</span><span>Sequence {preview.sequence}</span></div>
            <div className="mb-5 max-h-72 overflow-auto rounded-lg border border-white/10"><table className="w-full text-left text-[10px]"><thead className="bg-[#100d16] text-[#a58ab8]"><tr>{['Collector','Current balance','Original welcome','Credit addition'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{preview.grants.map((p:StudioRow)=><tr key={p.id} className="border-t border-white/5 text-[#c2a9d3]"><td className="p-3">{p.name}</td><td className="p-3">{p.balance.toLocaleString()}</td><td className="p-3">{p.originalWelcome??'REVIEW'}</td><td className="p-3">{p.reviewRequired?'Manual review':`+${p.grant.toLocaleString()}`}</td></tr>)}</tbody></table></div>
            <details className="mb-5 rounded-lg border border-white/10 p-4 text-xs text-[#a48fb7]"><summary className="cursor-pointer">Review new pack odds and reward settings</summary><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-[10px] leading-6">{JSON.stringify({rewards:preview.rules.rewards,jobs:preview.rules.expansion,packs:preview.packs},null,2)}</pre></details>
            <StudioText label="Type CONFIRM to activate economy 2.2" value={confirmation} onChange={setConfirmation}/>
            <Button disabled={busy||!editable||confirmation!=='CONFIRM'||reason.trim().length<5} onClick={()=>void work(async()=>{const result=await post({action:'activateEconomy',sequence:preview.sequence,revision:preview.revision,confirmation});setPreview(null);setConfirmation('');await load();setNotice(result.result.message)})}>Activate upgrade atomically</Button>
          </>}
        </div>}
        <div className="mt-8 border-t border-white/10 pt-6"><h3 className="mb-3 text-sm font-semibold">Export for external deployment</h3><code className="block overflow-x-auto rounded-lg bg-black/25 p-4 text-[11px] text-[#c7abdF]">pnpm run export:external --output dist/vault-release-v22</code><p className="mt-3 text-[10px] leading-6 text-[#927aa4]">Deploy the generated Next.js folder, not the Make workspace. Apply the studio SQL migration to Supabase before using these tools. Exporting does not reset or migrate your database.</p></div>
      </section>
    </>}
  </main>
}
