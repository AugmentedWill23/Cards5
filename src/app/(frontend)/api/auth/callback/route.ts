import { sessionClient } from '@/lib/supabase/server'
import { appAuth } from '@/lib/app-auth'
import { commitCommand } from '@/game/repository'

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code')
  if (code) {
    const { error } = await (await sessionClient()).auth.exchangeCodeForSession(code)
    if (!error) {
      try {
        const user = await appAuth.currentUser()
        if (user) {
          await commitCommand(user, { action: 'join', key: `join:${user.id}` })
          return new Response(null, {
            status: 303,
            headers: { Location: '/?auth=confirmed', 'Cache-Control': 'no-store' },
          })
        }
      } catch {
        // The session remains usable; GET /api/game safely retries an interrupted first join.
        return new Response(null, {
          status: 303,
          headers: { Location: '/?auth=retry', 'Cache-Control': 'no-store' },
        })
      }
    }
  }
  return new Response(null, {
    status: 303,
    headers: { Location: '/?auth=failed', 'Cache-Control': 'no-store' },
  })
}
