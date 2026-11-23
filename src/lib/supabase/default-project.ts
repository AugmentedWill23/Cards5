import type { SupabaseConnection } from './connection'

// Standalone hosting requires explicit project settings; no platform defaults or IDs.
export const defaultSupabaseConnection: SupabaseConnection | undefined = undefined
