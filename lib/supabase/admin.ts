import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for the small set of privileged RPCs
 * (store_monobank_token, ingest_transaction, decrypt_monobank_token) that
 * are intentionally not callable by the `authenticated` role. Server-only —
 * never import this from a Client Component or expose SUPABASE_SECRET_KEY
 * to the browser bundle.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
