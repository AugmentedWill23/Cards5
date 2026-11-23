import { runtimeConnection, serviceClient } from '@/lib/supabase/server'

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return Response.json(
      {
        backend: 'supabase',
        ready: false,
        code: 'SERVER_KEY_MISSING',
        message: 'Set SUPABASE_SERVICE_ROLE_KEY in the application server environment.',
      },
      { status: 503, headers },
    )
  try {
    runtimeConnection()
  } catch (error) {
    return Response.json(
      {
        backend: 'supabase',
        ready: false,
        code: 'SUPABASE_CONFIG_MISSING',
        message:
          error instanceof Error
            ? error.message
            : 'Configure the Supabase project URL and public key.',
      },
      { status: 503, headers },
    )
  }
  const { data, error, status } = await serviceClient().rpc('vault_runtime_catalog')
  if (!error && data?.studioVersion !== '2.2.0')
    return Response.json({backend:'supabase',ready:false,code:'STUDIO_SQL_REQUIRED',
      message:'Apply 20261119000100_vault_studio.sql before using the enhanced game and operator studio.'},{status:503,headers})
  if (!error && !(data?.configurations?.some((c: { active?: boolean; rules?: { rewards?: { starter?: number } } }) => c.active && (c.rules?.rewards?.starter ?? 0) >= 1250)))
    return Response.json({backend:'supabase',ready:false,code:'ECONOMY_ACTIVATION_REQUIRED',
      message:'Existing operators can sign in and activate economy 2.2 at /operator after reviewing the preserving player top-up.'},{status:503,headers})
  const credentialsRejected =
    /invalid api key|invalid jwt|jwt.*(expired|invalid)|unauthorized/i.test(error?.message ?? '')
  const sqlRequired = error?.code === 'PGRST202'
  const upstreamFailure = !!error && status >= 500
  const databaseCode = /^[A-Z0-9_]{1,24}$/.test(error?.code ?? '') ? ` ${error!.code}` : ''
  return Response.json(
    {
      backend: 'supabase',
      ready: !error,
      code: credentialsRejected
        ? 'SERVER_KEY_REJECTED'
        : sqlRequired
          ? 'RUNTIME_SQL_REQUIRED'
          : upstreamFailure
            ? 'SUPABASE_UPSTREAM_ERROR'
            : error
              ? 'DATABASE_NOT_READY'
              : 'CONNECTED',
      message: credentialsRejected
        ? 'Supabase rejected the saved server credential. Update SUPABASE_SERVICE_ROLE_KEY in the application host environment.'
        : sqlRequired
          ? 'Apply 20261118000100_vault_runtime_adapter.sql in Supabase SQL Editor.'
          : upstreamFailure
            ? `The Supabase request returned HTTP ${status}. Check project availability and retry; no Payload fallback is used.`
            : error
              ? `Check the server key and apply the runtime-adapter SQL. Database response: ${status}${databaseCode}.`
              : 'Supabase runtime catalog connection verified.',
    },
    { status: error ? 503 : 200, headers },
  )
}
