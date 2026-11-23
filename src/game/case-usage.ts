import type { World } from './types'

export type CaseUsage = {
  openings: number
  /** Exact release-scope counter for Limited edition enforcement; no standard edition exists. */
  minted: number
  distinct: number
  maxLifetime: number
  maxDaily: number
  day: string
}

/** Derived only from the server's decoded, immutable economy head. */
export function caseUsage(w: World, id: string, count: number, serialScope?: string | null, now = Date.now()): CaseUsage {
  const day = new Date(now).toISOString().slice(0, 10)
  const openings = w.counters[`stock:${id}`] ?? 0
  let maxLifetime = 0, maxDaily = 0
  for (const actor of Object.keys(w.players)) {
    const key = `case:${id}:player:${actor}`
    maxLifetime = Math.max(maxLifetime, w.counters[key] ?? 0)
    maxDaily = Math.max(maxDaily, w.counters[`${key}:day:${day}`] ?? 0)
  }
  return {
    openings, minted: serialScope ? (w.counters[`limited:${serialScope}`] ?? openings * count) : openings * count,
    distinct: w.counters[`case:${id}:distinct`] ?? 0, maxLifetime, maxDaily, day,
  }
}
