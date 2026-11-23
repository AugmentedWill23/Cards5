import 'server-only'
import { siteOrigin } from './site-origin'
// Defense in depth. Per-account economic limits live in persisted state.
// This process-local edge throttle must be replaced by a distributed limiter
// before running multiple production instances at significant scale.
const windows = new Map<string, { start: number; count: number }>()
export function enforceRequestSafety(request: Request, scope: string, limit = 60) {
  const origin = request.headers.get('origin')
  if (origin) {
    const allowed = [process.env.NEXT_PUBLIC_SITE_URL].filter(Boolean)
    const host = request.headers.get('host')
    const forwarded = request.headers.get('x-forwarded-host')
    const originHost = new URL(origin).host
    if (originHost !== host && originHost !== forwarded && !allowed.includes(origin))
      throw new Error('Invalid request origin')
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'local'
  const key = `${scope}:${ip}`,
    now = Date.now(),
    current = windows.get(key)
  if (!current || now - current.start > 60000) windows.set(key, { start: now, count: 1 })
  else {
    current.count++
    if (current.count > limit)
      throw new Error('Too many requests. Please take a moment before trying again.')
  }
  if (windows.size > 5000)
    for (const [k, v] of windows) if (now - v.start > 60000) windows.delete(k)
}
