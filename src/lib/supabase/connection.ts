export type SupabaseConnection = { url: string; publicKey: string }

// Public connection settings only. Never pass the service-role key as publicKey.
export function resolveSupabaseConnection(
  env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string },
  fallback?: SupabaseConnection,
): SupabaseConnection {
  const configuredURL = env.SUPABASE_URL?.trim()
  const url = configuredURL || fallback?.url
  const publicKey =
    env.SUPABASE_ANON_KEY?.trim() ||
    (!configuredURL || configuredURL.replace(/\/$/, '') === fallback?.url.replace(/\/$/, '')
      ? fallback?.publicKey
      : undefined)
  if (!url) throw new Error('Set SUPABASE_URL in the application server environment.')
  if (!publicKey) throw new Error('Set SUPABASE_ANON_KEY for the configured Supabase project.')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('SUPABASE_URL must be a valid project URL.')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (
    (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  )
    throw new Error(
      'SUPABASE_URL must be an HTTPS project origin, without credentials, paths or query parameters.',
    )
  return { url: parsed.origin, publicKey }
}
