import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The client expects the bare project URL (https://<ref>.supabase.co).
 * Dashboard copies sometimes include `/rest/v1/`, which would produce
 * `/rest/v1/auth/v1/...` requests (PGRST125) — strip it defensively.
 */
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const url = rawUrl?.replace(/\/+(rest|auth)\/v1\/*$/i, '').replace(/\/+$/, '') || undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** `null` when the env vars are missing — the app then only offers Demo Mode. */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null

export const isSupabaseConfigured = supabase !== null
