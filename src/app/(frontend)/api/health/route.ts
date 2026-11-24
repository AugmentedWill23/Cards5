// Liveness probe for the hosting platform. Deliberately has no dependencies,
// so it stays 200 even if Supabase is unreachable or not yet configured.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
