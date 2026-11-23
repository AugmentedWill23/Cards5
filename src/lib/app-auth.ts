import 'server-only'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { authCookie, BackendUnavailable, serviceClient, sessionClient } from './supabase/server'
import { siteOrigin } from './site-origin'

export type AppUser = { id: string; playerId: string; displayName: string; demo: false }
const safeName = (value: unknown) =>
  typeof value === 'string' && value.trim().length >= 2
    ? value
        .trim()
        .slice(0, 24)
        .replace(/[\u0000-\u001f\u007f]/g, '')
    : 'Collector'

async function resolvePlayer(user: User): Promise<AppUser> {
  if (user.is_anonymous || !user.email_confirmed_at)
    throw new Error('Confirm your email before entering the vault.')
  const client = serviceClient()
  const read = () =>
    client.from('vault_player_bindings').select('player_id').eq('user_id', user.id).maybeSingle()
  let binding = await read()
  if (binding.error) throw new BackendUnavailable('Supabase player bindings are unavailable.')
  if (!binding.data) {
    const playerId = `p_${createHash('sha256').update(`vault-supabase-player:${user.id}`).digest('hex').slice(0, 24)}`
    const inserted = await client.from('vault_player_bindings').insert({
      user_id: user.id,
      player_id: playerId,
      link_method: 'new-signup',
    })
    // A concurrent first login may have inserted the same immutable binding.
    if (inserted.error && inserted.error.code !== '23505')
      throw new BackendUnavailable('The collector identity could not be created. Please retry.')
    binding = await read()
  }
  if (binding.error || typeof binding.data?.player_id !== 'string')
    throw new BackendUnavailable('The collector identity could not be loaded.')
  return {
    id: user.id,
    playerId: binding.data.player_id,
    displayName: safeName(user.user_metadata?.display_name),
    demo: false,
  }
}

export const appAuth = {
  async currentUser(): Promise<AppUser | null> {
    // Ignore old Payload app/CMS sessions. No legacy identity is implicitly linked.
    if (!(await cookies()).getAll().some((c) => c.name.startsWith(authCookie))) return null
    const { data, error } = await (await sessionClient()).auth.getUser()
    if (error || !data.user) return null
    return resolvePlayer(data.user)
  },
  async login(email: string, password: string) {
    serviceClient() // Fail before accepting a session if private gameplay storage isn't configured.
    const { data, error } = await (
      await sessionClient()
    ).auth.signInWithPassword({ email, password })
    if (error || !data.user)
      throw new Error('Unable to sign in. Check your details and confirm your email if required.')
    return resolvePlayer(data.user)
  },
  async register(email: string, password: string, displayName: string) {
    serviceClient()
    const origin = siteOrigin()
    const { data, error } = await (
      await sessionClient()
    ).auth.signUp({
      email,
      password,
      options: {
        data: { display_name: safeName(displayName) },
        ...(origin ? { emailRedirectTo: `${origin.replace(/\/$/, '')}/api/auth/callback` } : {}),
      },
    })
    if (error)
      throw new Error('Unable to create the account. Check your details or try signing in.')
    if (!data.session || !data.user) return null
    return resolvePlayer(data.user)
  },
  async logout() {
    await (await sessionClient()).auth.signOut({ scope: 'local' })
    const store = await cookies()
    for (const cookie of store.getAll())
      if (cookie.name.startsWith(authCookie)) store.delete(cookie.name)
  },
}
