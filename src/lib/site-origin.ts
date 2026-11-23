export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  const value = env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('SITE_URL must be an http(s) origin without credentials, a path or query.')
  return url.origin
}
