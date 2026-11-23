import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const server = resolve('.next/standalone/server.js')
try {
  await access(server)
} catch {
  throw new Error('Production build not found. Run pnpm run build before pnpm start.')
}
process.env.NODE_ENV = 'production'
// Next.js reads HOSTNAME; map common HOST overrides and default to all interfaces.
process.env.HOSTNAME = process.env.HOST || '0.0.0.0'
process.env.PORT ||= '3000'
await import(pathToFileURL(server).href)
