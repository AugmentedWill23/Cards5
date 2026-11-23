import { Icon } from './icons'
import type { Card } from '@/game/types'
import type { Mutation } from '@/game/rules'
import { mutationFinishes, openingHighlight } from '@/game/presentation'
import styles from './CardEffects.module.css'
import type { VisualConfig } from '@/game/visuals'

export function MutationSurface({ mutation, finish }: { mutation?: Mutation | null; finish?: VisualConfig['finish'] }) {
  const surface = finish && finish !== 'inherit' ? finish : mutation ? mutationFinishes[mutation] : undefined
  if (!surface) return null
  return (
    <div aria-hidden="true" data-card-finish={surface} className={styles.finish}>
      <span className={styles.texture} />
      <span className={styles.sheen} data-finish-sheen="" />
      <span className={styles.edge} />
    </div>
  )
}
export function EffectSurface({ effect }: { effect?: VisualConfig['vfx'] }) {
  if (!effect || effect === 'none') return null
  return <div aria-hidden="true" data-card-vfx={effect} className={styles.vfx}><span/><span/><span/></div>
}
export const themeClass = styles.themed

const impactCopy = {
  epic: { eyebrow: 'A FIND WORTH KEEPING', title: 'There’s something special in this pack.' },
  legendary: { eyebrow: 'LEGENDARY MOMENT', title: 'Some finds stay with you.' },
  secret: { eyebrow: 'SECRET DISCOVERED', title: 'Beyond the ordinary. Far beyond.' },
  limited: { eyebrow: 'LIMITED EDITION UNBOXED', title: 'A place in the release’s history.' },
  perfect: { eyebrow: 'PERFECT CARD DISCOVERED', title: 'A flawless find. A permanent number.' },
}

export function PullCelebration({ cards }: { cards: Card[] }) {
  const highlight = openingHighlight(cards)
  if (!highlight) return null
  const { card, impact } = highlight
  const copy = impactCopy[impact]
  return (
    <section
      data-pull-impact={impact}
      className={`${styles.celebration} relative mb-6 overflow-hidden rounded-2xl border p-5 sm:p-6`}
      aria-label="Opening highlight"
    >
      <div className="relative z-10 flex items-center gap-5">
        <div
          className={`${styles.emblem} relative hidden h-22 w-22 shrink-0 items-center justify-center rounded-full border sm:flex`}
          aria-hidden="true"
        >
          <span className={styles.halo} />
          <span className={styles.haloOuter} />
          <Icon name={impact === 'perfect' ? 'spark' : 'diamond'} size={35} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[8px] font-semibold tracking-[.2em] opacity-75">{copy.eyebrow}</p>
          <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {card.name}
          </h3>
          <p className="mt-2 text-[10px] leading-5 opacity-80">{copy.title}</p>
          <p className="mt-3 text-[9px] leading-5 opacity-65">
            {card.attributes.limited ? 'Limited' : card.attributes.rarity} ·{' '}
            {card.attributes.quality}
            {card.attributes.mutation ? ` · ${card.attributes.mutation}` : ''}
            {card.snapshot.perfect && card.perfectSerial ? ` · Perfect #${card.perfectSerial}` : ''}
            {card.attributes.limited && card.attributes.serial
              ? ` · Limited #${card.attributes.serial}`
              : ''}
          </p>
        </div>
        <span className="hidden self-start rounded-full border border-current/15 px-3 py-1.5 text-[8px] tracking-widest opacity-60 md:block">
          SERVER COMMITTED
        </span>
      </div>
      <svg
        aria-hidden="true"
        viewBox="0 0 560 180"
        preserveAspectRatio="xMidYMid slice"
        className={styles.rays}
        data-celebration-rays=""
      >
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <circle cx="74" cy="90" r="35" />
          <circle cx="74" cy="90" r="63" />
          <circle cx="74" cy="90" r="100" />
          <path d="M74 8v28m0 108v28M0 90h21m107 0h42M16 32l21 21m74 74 22 22M16 148l21-21m74-74 22-22M207 24l8 8-8 8-8-8Zm252 90 5 5-5 5-5-5ZM376 30v12m-6-6h12M264 139v10m-5-5h10" />
        </g>
      </svg>
      <span aria-hidden="true" className={styles.revealSweep} />
    </section>
  )
}
