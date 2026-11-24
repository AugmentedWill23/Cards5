'use client'
import { useEffect, useState } from 'react'
import { readJson } from '@/lib/fetch-json'
import { Icon } from './icons'
import { Credits, PackVisual, Tag } from './ui'
import { Guide, Odds } from './screens'
import type { Pack, World } from '@/game/types'
import type { Rules } from '@/game/rules'

export default function OperatorPreview() {
  const [data, setData] = useState<{
    kind: string
    pack?: Pack
    rules?: Rules
    world?: World
  } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    void fetch(`/api/operator-preview?${query.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await readJson(response)
        if (!response.ok) throw new Error(result.error)
        setData(result)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load preview.'))
  }, [])
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <a href="/operator" className="mb-8 inline-flex items-center gap-2 text-xs text-[#bca3e8]">
        <Icon name="shield" size={16} />
        Back to operator console
      </a>
      <div className="mb-8 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Operator preview</h1>
        <Tag tone="amber">READ ONLY · NO PURCHASES</Tag>
      </div>
      <p className="mb-8 text-xs leading-7 text-[#9c87ad]">
        Review the saved draft before publishing. This preview never charges credits, consumes
        stock, or alters the active economy. For configurations, keep a new version inactive until
        you have reviewed its values.
      </p>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-6 text-sm leading-7 text-rose-200"
        >
          {error}
        </div>
      ) : !data ? (
        <div aria-busy="true" className="h-60 animate-pulse rounded-xl bg-white/5">
          <p className="p-6 text-xs text-[#9c87ad]">Checking operator authorization…</p>
        </div>
      ) : data.world ? (
        <WorldInspector world={data.world} />
      ) : data.pack ? (
        <section className="rounded-xl border border-white/10 bg-[#19161f] p-6">
          <div className="mx-auto mb-8 max-w-sm text-center">
            <PackVisual pack={data.pack} />
            <Tag tone={data.pack.color}>
              {data.pack.limited ? 'LIMITED RELEASE DRAFT' : 'STANDARD PACK DRAFT'}
            </Tag>
            <h2 className="my-4 font-display text-2xl">{data.pack.name}</h2>
            <p className="mb-4 text-xs text-[#9c87ad]">
              {data.pack.subtitle} · {data.pack.count} cards
            </p>
            <Credits value={data.pack.price} className="text-xl" />
            <p className="mt-4 text-[10px] text-[#9c87ad]">
              Stock cap: {data.pack.stock ?? 'No fixed cap'} · Edition:{' '}
              {data.pack.edition ?? 'Uncapped serials'}
            </p>
            <p className="mt-2 text-[10px] text-[#9c87ad]">
              {data.pack.starts
                ? `Starts ${new Date(data.pack.starts).toLocaleString()}`
                : 'No start restriction'}
              {data.pack.ends ? ` · Ends ${new Date(data.pack.ends).toLocaleString()}` : ''}
            </p>
          </div>
          {data.rules && <Odds pack={data.pack} rules={data.rules} />}
        </section>
      ) : (
        <Guide rules={data.rules} />
      )}
    </main>
  )
}

function WorldInspector({ world }: { world: World }) {
  const [entity, setEntity] = useState<keyof World>('players'),
    [search, setSearch] = useState('')
  const records = Object.entries(world[entity] ?? {}).filter(([id, value]) =>
    `${id} ${JSON.stringify(value)}`.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <section className="rounded-xl border border-white/10 bg-[#19161f] p-5">
      <h2 className="mb-3 font-display text-xl">Immutable economy inspector</h2>
      <p className="mb-5 text-[11px] leading-6 text-[#9c87ad]">
        Decoded historical commit. Search by public player ID, card ID, name or receipt. This view
        is read-only; use audited Support Operations for adjustments.
      </p>
      <div className="mb-5 flex flex-wrap gap-3">
        <select
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value as keyof World)
            setSearch('')
          }}
          aria-label="Inspect economy entity"
          className="rounded-lg border border-white/10 bg-[#101016] px-3 py-2 text-xs text-[#c6afd9]"
        >
          {(
            [
              'players',
              'cards',
              'listings',
              'trades',
              'receipts',
              'ledger',
              'sales',
              'counters',
              'requests',
              'expansion',
            ] as const
          ).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search economy records"
          placeholder="Search exact IDs, names, status…"
          className="min-w-50 flex-1 rounded-lg border border-white/10 bg-[#101016] px-3 py-2 text-xs text-[#c6afd9]"
        />
      </div>
      <p className="mb-4 text-[10px] text-[#8e759e]">
        {records.length} matching records · showing up to 100
      </p>
      <div className="space-y-2">
        {records.slice(0, 100).map(([id, value]) => (
          <details key={id} className="rounded-lg border border-white/8 p-3">
            <summary className="cursor-pointer break-all font-mono text-[10px] text-[#baa0ce]">
              {id}
            </summary>
            <pre className="mt-4 max-h-100 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/20 p-3 text-[10px] leading-6 text-[#9f88b2]">
              {JSON.stringify(value, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </section>
  )
}
