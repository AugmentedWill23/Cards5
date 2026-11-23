import { appAuth } from '@/lib/app-auth'
import { commitCommand } from '@/game/repository'
import { enforceRequestSafety } from '@/lib/request-safety'
import { BackendUnavailable } from '@/lib/supabase/server'
import { getCatalog } from '@/game/catalog'

export async function POST(request: Request) {
  try {
    enforceRequestSafety(request, 'account', 20)
    const text = await request.text()
    if (text.length > 8192) throw new Error('Account request is too large.')
    const input = JSON.parse(text)
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Invalid account request.')
    if (input.action === 'logout') {
      await appAuth.logout()
      return Response.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (!['login', 'register'].includes(input.action)) throw new Error('Unknown account action.')
    if (typeof input.email !== 'string' || typeof input.password !== 'string')
      throw new Error('Enter an email and password.')
    const email = input.email.trim().toLowerCase(),
      password = input.password
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      password.length < 8 ||
      password.length > 256 ||
      (input.action === 'register' &&
        (name.length < 2 || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)))
    )
      throw new Error(
        'Use a valid email, an 8–256 character password, and a 2–24 character display name.',
      )
    const catalog = await getCatalog()
    if (input.action === 'register' && (catalog.rules.rewards?.starter ?? 0) < 1250)
      throw new BackendUnavailable('New registration opens after an operator activates economy 2.2 and the 1,250-credit welcome grant. Existing collectors may still sign in.')
    const user =
      input.action === 'register'
        ? await appAuth.register(email, password, name)
        : await appAuth.login(email, password)
    if (!user)
      return Response.json(
        {
          success: true,
          confirmationRequired: true,
          message:
            'Check your email to confirm your account, then sign in. No credits are granted until your first verified login.',
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    await commitCommand(user, { action: 'join', key: `join:${user.id}` })
    return Response.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unable to continue.',
        code: error instanceof BackendUnavailable ? error.code : 'ACCOUNT_ERROR',
      },
      {
        status: error instanceof BackendUnavailable ? 503 : 400,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }
}
