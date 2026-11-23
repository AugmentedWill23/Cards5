import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const siteURL = new URL(configuredOrigin)
if (
  !['http:', 'https:'].includes(siteURL.protocol) ||
  siteURL.username ||
  siteURL.password ||
  siteURL.search ||
  siteURL.hash ||
  siteURL.pathname !== '/'
)
  throw new Error(
    'NEXT_PUBLIC_SITE_URL must be the public site origin, without a path, credentials or query.',
  )

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  poweredByHeader: false,
  // Keep build-time metadata and email callbacks on the actual public origin.
  // Secrets must never be added to this env block.
  env: { NEXT_PUBLIC_SITE_URL: siteURL.origin },
  experimental: { cpus: 2 },
}
export default config
