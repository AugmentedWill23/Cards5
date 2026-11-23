'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { Icon, toneStyle } from './icons'
import type { Card, Pack } from '@/game/types'
import { EffectSurface, MutationSurface, themeClass } from './CardEffects'
export const fmt = (n: number) => Math.floor(n).toLocaleString('en-US')
export const cardStatusLabel = (status: Card['status']) =>
  ({
    owned: 'Available',
    listed: 'Listed',
    locked: 'Trade locked',
    burned: 'Removed',
    displayed: 'Display locked',
    auctioned: 'Auction locked',
  })[status]
export function Credits({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${className}`}>
      <Icon name="coin" size={15} className="text-[#d6bc80]" />
      {fmt(value)}
    </span>
  )
}
export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled = false,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${variant === 'primary' ? 'bg-[#a28bf5] text-[#15111f] hover:bg-[#b6a3ff] shadow-[0_3px_16px_#a28bf518]' : variant === 'secondary' ? 'border border-white/10 bg-white/[.035] text-[#e2dfea] hover:bg-white/[.08]' : variant === 'danger' ? 'border border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20' : 'text-[#aaa6b8] hover:bg-white/5 hover:text-white'} ${className}`}
    >
      {children}
    </button>
  )
}
export function Tag({
  children,
  tone = 'violet',
  className = '',
}: {
  children: ReactNode
  tone?: string
  className?: string
}) {
  return (
    <span
      style={toneStyle(tone)}
      className={`inline-flex items-center gap-1.5 rounded border border-[color:var(--tone)]/20 bg-[color:var(--tone)]/8 px-2 py-1 text-[9px] font-semibold tracking-[.05em] text-[color:var(--tone)] ${className}`}
    >
      {children}
    </span>
  )
}
export const rarityTone = (rarity: string) =>
  (
    {
      'Dumpster Dive': '#8d8c96',
      Common: '#afacb9',
      Uncommon: '#63c4ad',
      Rare: '#79a5f5',
      Epic: '#b693f6',
      Legendary: '#eac27a',
      Mythical: '#ee91ae',
      Extraordinary: '#c797f2',
      Extreme: '#f19779',
      'Sudo-Secret': '#a9c8d8',
      Secret: '#e6d7ae',
      'Godly Secret': '#f4e7bd',
    } as Record<string, string>
  )[rarity] || '#a58aff'
export function CardTile({
  card,
  onClick,
  selected,
  onSelect,
  compact = false,
}: {
  card: Card
  onClick?: () => void
  selected?: boolean
  onSelect?: () => void
  compact?: boolean
}) {
  const Surface = onClick ? 'button' : 'div'
  return (
    <article
      style={toneStyle(card.visual?.color && card.visual.color !== 'rarity' ? card.visual.color : rarityTone(card.attributes.rarity))}
      className={`${themeClass} collectible group relative min-w-0 rounded-xl border border-[color:var(--tone)]/25 bg-[#17171e] text-left transition hover:-translate-y-1 hover:border-[color:var(--tone)]/60 motion-reduce:hover:translate-y-0 ${selected ? 'ring-2 ring-[#a58aff]' : ''}`}
      data-mutation={card.attributes.mutation ?? undefined}
      data-card-theme={card.visual?.theme}
    >
      <MutationSurface mutation={card.attributes.mutation} finish={card.visual?.finish} />
      <EffectSurface effect={card.visual?.vfx ?? (card.attributes.effect ? 'glow' : 'none')}/>
      {onSelect && (
        <input
          type="checkbox"
          checked={selected || false}
          onChange={onSelect}
          aria-label={`Select ${card.name}`}
          className="absolute right-3 top-3 z-10 accent-[#a58aff]"
        />
      )}
      <Surface
        onClick={onClick}
        className="relative z-[1] w-full text-left"
        aria-label={onClick ? `Inspect ${card.name}, ${card.attributes.rarity}` : undefined}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="font-mono text-[8px] tracking-[.13em] text-[#777382]">
            {card.serial ? `MINT #${card.serial}` : `V / ${card.id.slice(0, 6).toUpperCase()}`}
          </span>
          <span
            className={`${onSelect ? 'mr-5' : ''} flex items-center gap-1 text-[8px] uppercase tracking-wider text-[color:var(--tone)]`}
          >
            <span className="h-1 w-1 rounded-full bg-current" />
            {card.attributes.limited ? 'Limited' : card.attributes.rarity}
          </span>
        </div>
        <div className={`relative overflow-hidden px-4 ${compact ? 'py-5' : 'py-7'}`}>
          <div className="card-line-pattern pointer-events-none absolute inset-0 opacity-35" />
          <div className="relative mb-6 flex items-start justify-between">
            <span className="font-mono text-[8px] tracking-[.18em] text-[#85808e]">
              VAULT
              <br />
              COLLECTIBLES
            </span>
            <span className="text-[color:var(--tone)]">
              <Icon name={card.snapshot.perfect ? 'spark' : 'diamond'} size={27} />
            </span>
          </div>
          <h3 className="relative font-display text-[23px] font-medium tracking-tight text-[color:var(--tone)]">
            {card.name}
          </h3>
          <p className="relative mt-1 text-[9px] tracking-[.12em] text-[#8c8798] uppercase">
            {card.visual?.mutationName || card.attributes.mutation || 'Original impression'}
          </p>
          {(card.visual?.effectName || card.attributes.effect) && <p className="relative mt-2 text-[9px] text-[color:var(--tone)]">{card.visual?.effectName || card.attributes.effect}</p>}
          <div className="relative mt-5 flex items-center justify-between border-t border-white/[.06] pt-3">
            <div>
              <p className="text-[7px] tracking-widest text-[#777181]">QUALITY</p>
              <p className="mt-1 text-[10px] text-[#d6d0df]">{card.attributes.quality}</p>
            </div>
            <div className="text-right">
              <p className="text-[7px] tracking-widest text-[#777181]">GRADE</p>
              <p className="mt-1 font-mono text-[11px] text-[#e1dbea]">
                {card.attributes.grade ? `${card.attributes.grade} / 10` : 'Not rolled'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-b-xl border-t border-white/[.07] bg-black/10 px-4 py-3">
          <span className="text-[9px] text-[#8f899a]">True Value</span>
          <Credits value={card.snapshot.tv} className="text-[12px] font-semibold text-[#ddd7e9]" />
        </div>
      </Surface>
      {card.status !== 'owned' && (
        <span className="pointer-events-none absolute bottom-14 left-4 z-10 rounded bg-[#2c283b] px-2 py-1 text-[8px] text-[#c6b6f8]">
          {cardStatusLabel(card.status)}
        </span>
      )}
      {card.snapshot.perfect && (
        <span className="pointer-events-none absolute left-4 top-12 z-10 text-[8px] font-semibold text-[#edcc85]">
          {card.perfectSerial ? `PERFECT #${card.perfectSerial}` : 'PERFECT · PREVIEW'}
        </span>
      )}
    </article>
  )
}
export function PackVisual({
  pack,
  small = false,
}: {
  pack: Pick<Pack, 'name' | 'color' | 'slug'> & Partial<Pick<Pack, 'count' | 'visual'>>
  small?: boolean
}) {
  return (
    <div
      style={toneStyle(pack.color)}
      className={`pack-stage relative flex items-center justify-center overflow-hidden ${small ? 'h-37' : 'h-48'}`}
    >
      <div className="absolute h-24 w-28 rounded-full bg-[color:var(--tone)]/15 blur-3xl" />
      <div
        className={`${themeClass} foil-pack relative flex flex-col justify-between overflow-hidden border border-[color:var(--tone)]/50 bg-[#23212e] text-[color:var(--tone)] shadow-[12px_18px_22px_#0007] ${small ? 'h-29 w-21 p-2.5' : 'h-39 w-28 p-3.5'}`}
        data-card-theme={pack.visual?.theme}
      >
        <MutationSurface finish={pack.visual?.finish}/>
        <EffectSurface effect={pack.visual?.vfx}/>
        <div className="absolute inset-0 bg-linear-to-br from-[color:var(--tone)]/15 via-transparent to-[color:var(--tone)]/10" />
        <div className="relative flex justify-between border-b border-current/20 pb-1">
          <span className="text-[5px] font-bold tracking-[.2em]">VAULT</span>
          <span className="font-mono text-[5px]">SERIES 01</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center font-display text-[75px] font-light tracking-[-.2em] opacity-25">
          V
        </div>
        <div className="relative mx-auto flex h-13 w-13 rotate-45 items-center justify-center border border-current/40">
          <div className="h-9 w-9 border border-current/30" />
        </div>
        <div className="relative">
          <p
            className={`${small ? 'text-[9px]' : 'text-[12px]'} font-display font-medium tracking-[.08em] uppercase`}
          >
            {pack.name.replace(' Pack', '')}
          </p>
          <p className="mt-1 text-[5px] tracking-[.18em] opacity-60">
            {pack.count ?? 3} CARDS · INFINITE POSSIBILITIES
          </p>
        </div>
      </div>
    </div>
  )
}
export function Empty({
  icon = 'collection',
  title,
  children,
}: {
  icon?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-55 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-10 text-center">
      <div className="mb-4 rounded-xl border border-white/10 bg-white/3 p-3 text-[#a68eec]">
        <Icon name={icon} size={25} />
      </div>
      <h3 className="text-sm font-medium text-[#ddd8e5]">{title}</h3>
      <div className="mt-2 max-w-md text-xs leading-6 text-[#888392]">{children}</div>
    </div>
  )
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    el?.showModal()
    return () => el?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-32px)] rounded-2xl border border-white/12 bg-[#15151c] p-0 text-[#eeeaf4] shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
    >
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/8 bg-[#15151c] p-5">
        <div>
          <h2 className="font-display text-xl font-medium">{title}</h2>
          {subtitle && <p className="mt-1 text-[11px] text-[#8e889c]">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          autoFocus
          aria-label="Close dialog"
          className="rounded-md p-2 text-[#928b9e] hover:bg-white/5"
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-2 block text-[11px] font-medium text-[#bcb5ca]">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[10px] leading-5 text-[#777181]">{hint}</span>}
    </label>
  )
}
