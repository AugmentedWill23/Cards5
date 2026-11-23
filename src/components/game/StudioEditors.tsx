'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { calculateValue, mutations, qualities, rarities, type Rules } from '@/game/rules'
import { visualEffects, visualFinishes, visualThemes } from '@/game/visuals'
import type { CaseUsage } from '@/game/case-usage'
import { studioColors, validateCase, validateDesign } from '@/game/authoring'
import { disclosePack } from '@/game/pack-disclosure'
import type { Card, CardDesign, Pack } from '@/game/types'
import { Button, CardTile, Field, PackVisual } from './ui'
import { Odds } from './screens'

export type StudioRow = Record<string, any>
function VisualControls({ value, onChange }: { value: StudioRow; onChange: (value: StudioRow) => void }) {
  const set = (key: string, v: string) => onChange({ ...value, [key]: v })
  return <section className="mb-6 rounded-xl border border-white/10 bg-black/10 p-4">
    <h3 className="mb-2 text-xs font-semibold text-[#dfc9ee]">Art direction & special-effect VFX</h3>
    <p className="mb-4 text-[10px] leading-6 text-[#9a82ac]">These are authoring tools, not premade releases. Seasonal themes and custom labels are cosmetic; real mutation/effect multipliers come from guaranteed attributes above. Existing cards retain their mint-time design. VFX respects reduced motion.</p>
    <div className="grid gap-x-4 sm:grid-cols-2">
      <StudioSelect label="Design / seasonal treatment" value={value.theme??'classic'} onChange={v=>set('theme',v)}>{visualThemes.map(v=><option key={v}>{v}</option>)}</StudioSelect>
      <StudioSelect label="Surface mutation / finish" value={value.finish??'inherit'} onChange={v=>set('finish',v)}>{visualFinishes.map(v=><option key={v}>{v}</option>)}</StudioSelect>
      <StudioSelect label="Special-effect VFX" value={value.vfx??'none'} onChange={v=>set('vfx',v)}>{visualEffects.map(v=><option key={v}>{v}</option>)}</StudioSelect>
      <StudioText label="Custom effect display label · cosmetic" value={value.effectName??''} onChange={v=>set('effectName',v)} maxLength={80}/>
      <StudioText label="Custom mutation display label · cosmetic" value={value.mutationName??''} onChange={v=>set('mutationName',v)} maxLength={80}/>
    </div>
  </section>
}
export const studioInput =
  'w-full rounded-lg border border-white/10 bg-[#100e17] px-3 py-2.5 text-xs text-[#e7def0] outline-none focus:border-[#b99bea]'
export function StudioText({
  label,
  value,
  onChange,
  area = false,
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
  area?: boolean
  disabled?: boolean
  required?: boolean
  maxLength?: number
  type?: string
}) {
  return (
    <Field label={label}>
      {area ? (
        <textarea
          className={`${studioInput} min-h-24`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
      ) : (
        <input
          className={studioInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
      )}
    </Field>
  )
}
export function StudioSelect({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        className={studioInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    </Field>
  )
}
export function StudioNumber({
  label,
  value,
  onChange,
  min = 0,
  max = 1e12,
  step = 1,
  disabled,
  nullable = false,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  nullable?: boolean
}) {
  return (
    <Field label={label}>
      <input
        className={studioInput}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        required={!nullable}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === '' && nullable ? null : Number(e.target.value))
        }
      />
    </Field>
  )
}
export function AttributeDefaults({
  value,
  onChange,
  rules,
  support = false,
}: {
  value: StudioRow
  onChange: (next: StudioRow) => void
  rules: Rules
  support?: boolean
}) {
  const rollLabel = support ? 'Use neutral value / design guarantee' : 'Roll with pack odds'
  const update = (key: string, next: string) => {
    const copy = { ...value }
    if (next === 'roll') delete copy[key]
    else copy[key] = next === 'none' ? null : key === 'grade' ? Number(next) : next
    onChange(copy)
  }
  const selected = (key: string) =>
    Object.hasOwn(value, key) ? (value[key] == null ? 'none' : String(value[key])) : 'roll'
  return (
    <div className="grid gap-x-4 sm:grid-cols-2">
      <StudioSelect
        label="Default quality"
        value={selected('quality')}
        onChange={(v) => update('quality', v)}
      >
        <option value="roll">{rollLabel}</option>
        {qualities.map((q) => (
          <option key={q}>{q}</option>
        ))}
      </StudioSelect>
      <StudioSelect
        label="Default grade"
        value={selected('grade')}
        onChange={(v) => update('grade', v)}
      >
        <option value="roll">{rollLabel}</option>
        <option value="none">Guarantee ungraded</option>
        {Array.from({ length: 10 }, (_, i) => (
          <option key={i} value={i + 1}>
            Grade {i + 1}
          </option>
        ))}
      </StudioSelect>
      <StudioSelect
        label="Default mutation / finish"
        value={selected('mutation')}
        onChange={(v) => update('mutation', v)}
      >
        <option value="roll">{rollLabel}</option>
        <option value="none">Guarantee no mutation</option>
        {mutations.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </StudioSelect>
      <StudioSelect
        label="Default special effect"
        value={selected('effect')}
        onChange={(v) => update('effect', v)}
      >
        <option value="roll">{rollLabel}</option>
        <option value="none">Guarantee no effect</option>
        {Object.entries(rules.effects)
          .filter(([, e]) => e.enabled !== false && !e.archived)
          .map(([name]) => (
            <option key={name}>{name}</option>
          ))}
      </StudioSelect>
    </div>
  )
}
export function gameDesign(d: StudioRow): CardDesign {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    slug: d.slug,
    rarity: d.rarity,
    enabled: d.enabled,
    availability: d.availability,
    baseValue: d.base_value_override,
    defaults: d.default_attributes,
    visual: d.visual_config,
  }
}
export function previewCard(d: StudioRow, rules: Rules): Card {
  const attributes = {
    rarity: d.rarity,
    quality: 'Normal' as const,
    ...d.default_attributes,
    ...(d.base_value_override == null ? {} : { baseValue: d.base_value_override }),
  }
  return {
    id: 'preview-only',
    owner: 'preview',
    name: d.name || 'Untitled design',
    description: d.description,
    attributes,
    snapshot: calculateValue(attributes, rules),
    visual: d.visual_config,
    createdAt: new Date(0).toISOString(),
    source: 'Read-only design preview',
    status: 'owned',
    provenance: [],
  }
}
export function casePreview(
  d: StudioRow,
  pool: StudioRow[],
  docs: StudioRow[],
  rules: Rules,
  usage?: CaseUsage,
): Pack {
  const { data } = validateCase(d, pool, usage)
  const pack: Pack = {
    id: 'preview',
    name: data.name,
    slug: data.slug,
    subtitle: data.subtitle,
    price: data.price!,
    count: data.cards_per_opening,
    color: data.visual_config.color,
    visual: data.visual_config as Pack['visual'],
    enabled: true,
    odds: data.odds,
    limited: data.kind === 'limited',
    stock: data.max_total_openings,
    edition: data.edition_cap,
    serialScope: data.serial_scope,
    starts: data.starts_at,
    ends: data.ends_at,
  }
  if (data.pool_mode === 'assigned')
    pack.pool = pool.map((p) => {
      const design = docs.find((r) => r.id === p.design_id)
      if (!design?.enabled || (!pack.limited && design.availability === 'limited-only'))
        throw new Error('Assign enabled, eligible designs.')
      return {
        designId: p.design_id,
        name: design.name,
        rarity: design.rarity,
        weight: Number(p.weight),
      }
    })
  return disclosePack(pack, docs.filter((r) => r.enabled).map(gameDesign), rules)
}
const blankDesign = () =>
  ({
    name: '',
    slug: '',
    description: '',
    rarity: 'Common',
    enabled: true,
    availability: 'standard',
    base_value_override: null,
    default_attributes: {},
    visual_config: { color: 'rarity' },
  }) as StudioRow
const designKeys = Object.keys(blankDesign())
const pick = (d: StudioRow, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => d[key] !== undefined).map((key) => [key, d[key]]))
type EditorProps = {
  record: StudioRow | null
  rules: Rules
  busy: boolean
  canEdit: boolean
  save: (
    action: string,
    record: StudioRow | null,
    data: StudioRow,
    pool?: StudioRow[],
  ) => Promise<void>
}
export function CardStudioEditor({ record, rules, busy, canEdit, save }: EditorProps) {
  const [draft, setDraft] = useState<StudioRow>(() => ({
    ...blankDesign(),
    ...pick(record ?? {}, designKeys),
  }))
  useEffect(() => {
    setDraft({ ...blankDesign(), ...pick(record ?? {}, designKeys) })
  }, [record])
  const field = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }))
  let preview: Card | null = null,
    previewError = ''
  try {
    preview = previewCard(draft, rules)
  } catch (e) {
    previewError = e instanceof Error ? e.message : 'Invalid preview'
  }
  return (
    <form
      aria-label="Card design editor"
      onSubmit={(e) => {
        e.preventDefault()
        void save('saveDesign', record, draft)
      }}
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-xl">
              {record?.id ? 'Edit design' : 'New card design'}
            </h2>
            <span className="text-[10px] text-[#a48bbd]">
              {record?.id ? `REV ${record.revision}` : 'UNSAVED'}
            </span>
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <StudioText
              label="Card name"
              value={draft.name}
              onChange={(v) => field('name', v)}
              required
              maxLength={80}
            />
            <StudioText
              label="Stable design slug"
              value={draft.slug}
              onChange={(v) => field('slug', v)}
              required
              maxLength={160}
            />
            <StudioSelect
              label="Underlying rarity"
              value={draft.rarity}
              onChange={(v) => field('rarity', v)}
            >
              {rarities.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </StudioSelect>
            <StudioSelect
              label="Availability"
              value={draft.availability}
              onChange={(v) => field('availability', v)}
            >
              <option value="standard">Standard packs + assigned cases</option>
              <option value="assigned-only">Assigned cases only</option>
              <option value="limited-only">Limited assigned cases only</option>
            </StudioSelect>
            <StudioNumber
              label="Custom base value · blank uses rarity"
              value={draft.base_value_override}
              nullable
              min={1}
              onChange={(v) => field('base_value_override', v)}
            />
            <div>
              <StudioSelect
                label="Card accent color"
                value={draft.visual_config?.color ?? 'rarity'}
                onChange={(v) => field('visual_config', { ...draft.visual_config, color: v === 'custom' ? '#b79bf1' : v })}
              >
                <option value="rarity">Use rarity color</option>
                {studioColors.map((c) => (
                  <option key={c}>{c}</option>
                ))}
                {draft.visual_config?.color?.startsWith('#') && (
                  <option value={draft.visual_config.color}>
                    Custom · {draft.visual_config.color}
                  </option>
                )}
                <option value="custom">Choose a custom hex color…</option>
              </StudioSelect>
              {draft.visual_config?.color?.startsWith('#') && (
                <input
                  aria-label="Custom card hex color"
                  type="color"
                  className="mb-4 h-10 w-16"
                  value={draft.visual_config.color}
                  onChange={(e) => field('visual_config', { ...draft.visual_config, color: e.target.value })}
                />
              )}
            </div>
          </div>
          <StudioText
            label="Card description / flavor"
            value={draft.description}
            area
            maxLength={2000}
            onChange={(v) => field('description', v)}
          />
          <h3 className="mb-4 mt-5 text-xs font-semibold text-[#e2d0ef]">Guaranteed attributes</h3>
          <p className="mb-4 text-[11px] leading-6 text-[#9680a6]">
            Choose a guaranteed attribute or let the pack roll it. Mutation finishes also use the
            real mutation multiplier. A custom base is saved onto each new card, never looked up
            retroactively.
          </p>
          <AttributeDefaults
            value={draft.default_attributes ?? {}}
            onChange={(v) => field('default_attributes', v)}
            rules={rules}
          />
          <VisualControls value={draft.visual_config??{}} onChange={v=>field('visual_config',v)}/>
          <label className="my-5 flex gap-3 text-xs text-[#beaacf]">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => field('enabled', e.target.checked)}
            />
            Enabled for future mints
          </label>
          <Button type="submit" disabled={busy || !canEdit}>
            Save card design
          </Button>
        </div>
        <aside className="min-w-0">
          <p className="mb-4 text-[9px] tracking-[.2em] text-[#9d80bf]">
            LIVE VALUE PREVIEW · NOT MINTED
          </p>
          {preview ? (
            <CardTile card={preview} />
          ) : (
            <p className="text-xs text-rose-200">{previewError}</p>
          )}
          <p className="mt-4 text-[10px] leading-6 text-[#927aa4]">
            Preview uses neutral values where an attribute will roll. All real values and serials
            are assigned on the server. Editing this definition never renames owned cards.
          </p>
        </aside>
      </div>
    </form>
  )
}
export const blankCase = () =>
  ({
    name: '',
    slug: '',
    subtitle: '',
    kind: 'standard',
    status: 'draft',
    price: 500,
    cards_per_opening: 3,
    pool_mode: 'rarity',
    odds: {
      rarity: [0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      quality: [5, 10, 50, 25, 8, 2],
      grade: 10,
      mutation: 5,
      effect: 1,
    },
    configuration_id: null,
    starts_at: null,
    ends_at: null,
    max_total_openings: null,
    max_distinct_players: null,
    per_player_limit: null,
    per_player_daily_limit: null,
    cooldown_seconds: 0,
    edition_cap: null,
    serial_scope: null,
    perfect_qualifying_tier: null,
    visual_config: { color: 'violet' },
  }) as StudioRow
const caseKeys = Object.keys(blankCase())
function caseDraft(record: StudioRow | null) {
  const blank = blankCase(),
    selected = pick(record ?? {}, caseKeys)
  return {
    ...blank,
    ...selected,
    odds: {
      ...blank.odds,
      ...selected.odds,
      rarity: selected.odds?.rarity ?? blank.odds.rarity,
      quality: selected.odds?.quality ?? blank.odds.quality,
    },
  }
}
export function CaseStudioEditor({
  record,
  rules,
  busy,
  canEdit,
  save,
  designs,
  configurations,
  releasedEditing = false,
}: EditorProps & { designs: StudioRow[]; configurations: StudioRow[]; releasedEditing?: boolean }) {
  const [draft, setDraft] = useState<StudioRow>(() => caseDraft(record))
  const [pool, setPool] = useState<StudioRow[]>(record?.pool ?? [])
  const [acknowledged,setAcknowledged] = useState(false)
  useEffect(() => {
    setDraft(caseDraft(record))
    setPool(record?.pool ?? [])
    setAcknowledged(false)
  }, [record])
  const field = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }))
  const identityLocked = !!record?.first_opened_at
  const locked = identityLocked && !releasedEditing
  const usage = record?.id ? record.usage as CaseUsage | undefined : undefined
  const weights = (kind: 'rarity' | 'quality', index: number, value: number | null) =>
    setDraft((d) => ({
      ...d,
      odds: {
        ...d.odds,
        [kind]: d.odds[kind].map((n: number, i: number) => (i === index ? (value ?? 0) : n)),
      },
    }))
  let preview: Pack | null = null,
    previewError = ''
  try {
    preview = casePreview(draft, pool, designs, rules, usage)
  } catch (e) {
    previewError = e instanceof Error ? e.message : 'Invalid preview'
  }
  return (
    <form
      aria-label="Pack and case editor"
      onSubmit={(e) => {
        e.preventDefault()
        if (identityLocked && releasedEditing && !acknowledged) return
        void save('saveCase', record, draft, draft.pool_mode === 'assigned' ? pool : [])
      }}
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-xl">
          {record?.id ? 'Edit pack / case' : 'New pack / case'}
        </h2>
        <span className="text-[10px] text-[#a48bbd]">
          {record?.id ? `REV ${record.revision}` : 'UNSAVED'}
        </span>
      </div>
      <VisualControls value={draft.visual_config??{}} onChange={v=>field('visual_config',v)}/>
      {identityLocked && (
        <p className="mb-5 rounded-lg border border-amber-200/15 p-4 text-xs leading-6 text-amber-100">
          {releasedEditing ? 'Future openings use your new price, odds, contents, card count, schedule and limits. Owned cards, serials, receipts, battle terms and usage counters never reset. Release slug, category and serial namespace remain fixed.' :
            'Apply 20261120000100_vault_released_pack_editing.sql to unlock forward-only economic editing. Until then, only name, description, visuals and status can be changed.'}
          {usage && ` Already used: ${usage.openings} openings${record?.kind==='limited' ? `, ${usage.minted} minted Limited cards` : ''}, ${usage.distinct} collectors. Largest player usage: ${usage.maxLifetime} lifetime / ${usage.maxDaily} today.`}
        </p>
      )}
      <div className="grid gap-x-5 md:grid-cols-2 xl:grid-cols-3">
        <StudioText
          label="Pack / case name"
          required
          value={draft.name}
          onChange={(v) => field('name', v)}
          maxLength={100}
        />
        <StudioText
          label="Case slug"
          required
          disabled={identityLocked}
          value={draft.slug}
          onChange={(v) => field('slug', v)}
          maxLength={160}
        />
        <StudioSelect
          label="Publication status"
          value={draft.status}
          onChange={(v) => field('status', v)}
        >
          {['draft', 'published', 'paused', 'archived'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </StudioSelect>
        <StudioSelect
          label="Release category"
          disabled={identityLocked}
          value={draft.kind}
          onChange={(v) => field('kind', v)}
        >
          <option value="standard">Standard</option>
          <option value="limited">Limited serial release</option>
        </StudioSelect>
        <StudioSelect
          label="Contents mode"
          disabled={locked}
          value={draft.pool_mode}
          onChange={(v) => field('pool_mode', v)}
        >
          <option value="rarity">Normal pack · roll rarity</option>
          <option value="assigned">Custom case · assigned designs</option>
        </StudioSelect>
        <div>
          <StudioSelect
            label="Pack accent color"
            value={draft.visual_config?.color ?? 'violet'}
            onChange={(v) => field('visual_config', { ...draft.visual_config, color: v === 'custom' ? '#b79bf1' : v })}
          >
            {studioColors.map((c) => (
              <option key={c}>{c}</option>
            ))}
            {draft.visual_config?.color?.startsWith('#') && (
              <option value={draft.visual_config.color}>
                Custom · {draft.visual_config.color}
              </option>
            )}
            <option value="custom">Choose a custom hex color…</option>
          </StudioSelect>
          {draft.visual_config?.color?.startsWith('#') && (
            <input
              aria-label="Custom pack hex color"
              type="color"
              className="mb-4 h-10 w-16"
              value={draft.visual_config.color}
              onChange={(e) => field('visual_config', { ...draft.visual_config, color: e.target.value })}
            />
          )}
        </div>
        <StudioNumber
          label="Price in credits"
          disabled={locked}
          min={1}
          value={draft.price}
          onChange={(v) => field('price', v)}
        />
        <StudioNumber
          label="Cards per opening"
          disabled={locked}
          min={1}
          max={5}
          value={draft.cards_per_opening}
          onChange={(v) => field('cards_per_opening', v)}
        />
        <StudioSelect
          label="Configuration version"
          disabled={locked}
          value={draft.configuration_id ?? ''}
          onChange={(v) => field('configuration_id', v || null)}
        >
          <option value="">Inherit active rules</option>
          {configurations
            .filter((c) => c.active || c.id === draft.configuration_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.version}
              </option>
            ))}
        </StudioSelect>
      </div>
      <StudioText
        label="Pack description"
        area
        value={draft.subtitle}
        onChange={(v) => field('subtitle', v)}
        maxLength={500}
      />
      {draft.pool_mode === 'assigned' && (
        <section className="my-7 rounded-xl border border-[#b99bea]/15 bg-[#0f0d15]/70 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Assigned card pool</h3>
            <span className="font-mono text-xs text-[#c1a6e3]">
              {pool
                .reduce((s, p) => s + Number(p.weight), 0)
                .toFixed(6)
                .replace(/0+$/, '')
                .replace(/\.$/, '')}
              % / 100%
            </span>
          </div>
          {pool.map((entry, i) => (
            <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_80px]">
              <select
                aria-label={`Assigned card ${i + 1}`}
                disabled={locked}
                className={studioInput}
                value={entry.design_id}
                onChange={(e) =>
                  setPool((p) =>
                    p.map((row, j) => (j === i ? { ...row, design_id: e.target.value } : row)),
                  )
                }
              >
                {designs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.rarity}
                    {!d.enabled ? ' · disabled' : ''}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Assigned weight ${i + 1}`}
                type="number"
                min={0.000001}
                max={100}
                step={0.000001}
                className={studioInput}
                disabled={locked}
                value={entry.weight}
                onChange={(e) =>
                  setPool((p) =>
                    p.map((row, j) => (j === i ? { ...row, weight: Number(e.target.value) } : row)),
                  )
                }
              />
              <Button
                type="button"
                variant="secondary"
                disabled={locked}
                onClick={() => setPool((p) => p.filter((_, j) => i !== j))}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={locked || pool.length >= 200 || !designs.length}
              onClick={() => {
                const available = designs.find((d) => !pool.some((p) => p.design_id === d.id))
                if (available)
                  setPool((p) => [...p, { design_id: available.id, weight: p.length ? 0 : 100 }])
              }}
            >
              Add assigned card
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={locked || !pool.length}
              onClick={() =>
                setPool((p) => {
                  const weight = Math.floor(1e8 / p.length) / 1e6
                  return p.map((row, i) => ({
                    ...row,
                    weight:
                      i === p.length - 1
                        ? Number((100 - weight * (p.length - 1)).toFixed(6))
                        : weight,
                  }))
                })
              }
            >
              Split weights equally
            </Button>
          </div>
          <p className="mt-3 text-[10px] leading-6 text-[#9680a6]">
            Weights must total exactly 100%. Each card slot makes an independent weighted draw.
            Standard cases cannot use Limited-only designs.
          </p>
        </section>
      )}
      <details
        className="my-7 rounded-xl border border-white/10 p-5"
        open={draft.pool_mode === 'rarity'}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Rarity and attribute odds
        </summary>
        <p className="my-4 text-[10px] leading-6 text-[#9680a6]">
          Normal packs roll rarity, then an equally likely eligible design within that tier.
          Assigned cases use their card pool instead. All quality weights total 100%.
        </p>
        {draft.pool_mode === 'rarity' && (
          <>
            <p className="mb-3 font-mono text-xs text-[#c1a6e3]">
              Rarity total: {draft.odds.rarity.reduce((a: number, b: number) => a + b, 0)}%
            </p>
            <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
              {rarities.map((r, i) => (
                <StudioNumber
                  key={r}
                  label={`${r} rarity weight`}
                  disabled={locked}
                  max={100}
                  step={0.000001}
                  value={draft.odds.rarity[i]}
                  onChange={(v) => weights('rarity', i, v)}
                />
              ))}
            </div>
          </>
        )}
        <p className="my-3 font-mono text-xs text-[#c1a6e3]">
          Quality total: {draft.odds.quality.reduce((a: number, b: number) => a + b, 0)}%
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
          {qualities.map((q, i) => (
            <StudioNumber
              key={q}
              label={`${q} quality weight`}
              disabled={locked}
              max={100}
              step={0.000001}
              value={draft.odds.quality[i]}
              onChange={(v) => weights('quality', i, v)}
            />
          ))}
          {['grade', 'mutation', 'effect'].map((key) => (
            <StudioNumber
              key={key}
              label={`${key} roll chance (%)`}
              disabled={locked}
              max={100}
              step={0.000001}
              value={draft.odds[key]}
              onChange={(v) => field('odds', { ...draft.odds, [key]: v ?? 0 })}
            />
          ))}
        </div>
      </details>
      <details
        className="my-7 rounded-xl border border-white/10 p-5"
        open={draft.kind === 'limited'}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Schedule, stock and participation
        </summary>
        <p className="my-4 text-[10px] leading-6 text-[#9680a6]">
          Blank means no limit. Opening stock counts packs, not cards. Every limit is enforced with
          the wallet/card commit.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
          {['starts_at', 'ends_at'].map((key) => (
            <StudioText
              key={key}
              label={key === 'starts_at' ? 'Starts at · UTC' : 'Ends at · UTC'}
              disabled={locked}
              type="datetime-local"
              value={draft[key]?.slice(0, 16) ?? ''}
              onChange={(v) => field(key, v ? new Date(v + 'Z').toISOString() : null)}
            />
          ))}
          {[
            ['max_total_openings', 'Total opening stock'],
            ['max_distinct_players', 'Distinct-player cap'],
            ['per_player_limit', 'Per-player lifetime openings'],
            ['per_player_daily_limit', 'Per-player UTC daily openings'],
          ].map(([key, label]) => (
            <StudioNumber
              key={key}
              label={label}
              disabled={locked}
              nullable
              min={1}
              max={key.startsWith('per_') ? 1e9 : 1e12}
              value={draft[key]}
              onChange={(v) => field(key, v)}
            />
          ))}
          <StudioNumber
            label="Cooldown seconds"
            disabled={locked}
            max={86400}
            value={draft.cooldown_seconds}
            onChange={(v) => field('cooldown_seconds', v ?? 0)}
          />
          {draft.kind === 'limited' && (
            <>
              <StudioText
                label="Immutable serial namespace"
                disabled={identityLocked}
                value={draft.serial_scope ?? draft.slug}
                onChange={(v) => field('serial_scope', v)}
                required
                maxLength={160}
              />
              <StudioNumber
                label="Limited card edition cap · optional"
                disabled={locked}
                nullable
                min={1}
                max={Number.MAX_SAFE_INTEGER}
                value={draft.edition_cap}
                onChange={(v) => field('edition_cap', v)}
              />
              <StudioSelect
                label="Underlying Perfect qualifying tier"
                disabled={locked}
                value={draft.perfect_qualifying_tier ?? ''}
                onChange={(v) => field('perfect_qualifying_tier', v || null)}
              >
                <option value="">Not Perfect-eligible</option>
                {rarities.slice(7).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </StudioSelect>
            </>
          )}
        </div>
        {draft.kind === 'limited' && (
          <p className="text-[10px] leading-6 text-[#bda7cf]">
            Edition cap, if set, must equal already-minted cards + remaining opening stock × new
            cards per opening. For a new release this is stock × cards per opening. Serial numbers
            are never recycled.
          </p>
        )}
      </details>
      <div className="mb-6 rounded-xl border border-[#a78bda]/15 bg-[#15111d] p-5">
        <div className="mx-auto max-w-xs text-center">
          <PackVisual
            pack={{
              name: draft.name || 'Untitled Pack',
              slug: draft.slug || 'draft',
              color: draft.visual_config?.color ?? 'violet',
              visual: draft.visual_config,
              count: draft.cards_per_opening,
            }}
            small
          />
          <p className="mb-5 text-xs text-[#bba4cf]">
            {draft.price.toLocaleString()} credits · {draft.cards_per_opening} cards · preview only
          </p>
        </div>
        {preview ? (
          <Odds pack={preview} rules={rules} />
        ) : (
          <p role="status" className="text-xs leading-6 text-amber-100">
            {previewError}
          </p>
        )}
      </div>
      {identityLocked && releasedEditing && <label className="mb-5 flex items-start gap-3 text-xs leading-6 text-[#beaacf]"><input className="mt-1 accent-[#b59bdc]" type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>I authorize these future-only release changes. Existing assets, supply already minted and player-use counters will be preserved.</label>}
      <Button type="submit" disabled={busy || !canEdit || (identityLocked && releasedEditing && !acknowledged)}>
        Save pack / case
      </Button>
    </form>
  )
}
