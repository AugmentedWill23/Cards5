import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveSupabaseConnection } from './connection'
import { defaultSupabaseConnection } from './default-project'

export class BackendUnavailable extends Error {
  readonly code = 'SUPABASE_NOT_READY'
}
export function runtimeConnection() {
  try {
    return resolveSupabaseConnection(
      {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      },
      defaultSupabaseConnection,
    )
  } catch (error) {
    throw new BackendUnavailable(
      error instanceof Error ? error.message : 'Supabase configuration is missing.',
    )
  }
}
export const authCookie = 'vault-supabase-auth'
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' })

// Never instantiate this client in browser code or fall back to a public key.
export function serviceClient() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret)
    throw new BackendUnavailable(
      'Supabase gameplay needs SUPABASE_SERVICE_ROLE_KEY in the application server environment.',
    )
  return createClient(runtimeConnection().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: noStoreFetch },
  })
}

// Only called from route handlers, where refreshed cookies may be written.
export async function sessionClient() {
  const store = await cookies()
  const connection = runtimeConnection()
  return createServerClient(connection.url, connection.publicKey, {
    cookieOptions: {
      name: authCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values)
          store.set(name, value, { ...options, httpOnly: true })
      },
    },
    global: { fetch: noStoreFetch },
  })
}
