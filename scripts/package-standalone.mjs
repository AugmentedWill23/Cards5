import { access, cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('.next/standalone')
try {
  await access(`${output}/server.js`)
} catch {
  throw new Error(
    'Standalone server.js is missing. Check the Next.js outputFileTracingRoot before packaging.',
  )
}
await mkdir(`${output}/.next`, { recursive: true })
await cp('public', `${output}/public`, { recursive: true })
await cp('.next/static', `${output}/.next/static`, { recursive: true })
console.log('Standalone server packaged with public files and browser assets.')
