import 'server-only'
import { BackendUnavailable, serviceClient } from '@/lib/supabase/server'
import { parseRuntimeCatalog } from './supabase-catalog'

// Private gameplay API reads a consistent, current catalog for each command.
// Public pages remain static shells; no Payload or bundled-data fallback exists.
let parsed: ReturnType<typeof parseRuntimeCatalog> | undefined
export async function getCatalog() {
  const { data, error } = await serviceClient().rpc('vault_runtime_catalog')
  if (error)
    throw new BackendUnavailable(
      'Supabase gameplay is not ready. Apply the runtime-adapter SQL and check the server key.',
    )
  // Always fetch the current revision; only reuse the expensive validation and
  // probability projection when the database says the catalog is unchanged.
  if (parsed && data?.revision === parsed.revision) return parsed
  parsed = parseRuntimeCatalog(data)
  return parsed
}
