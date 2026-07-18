-- Supabase grants EXECUTE on new public-schema functions to anon and
-- authenticated by default (a schema-level default privilege), separate
-- from the PUBLIC pseudo-role. `revoke ... from public` alone does not
-- touch that direct grant, so the three privileged functions were callable
-- via RPC by any signed-in user despite the earlier revoke. Confirmed by a
-- failing integration test (supabase/tests/schema.test.ts) before this fix.
revoke execute on function public.decrypt_monobank_token(uuid, text) from anon, authenticated;
revoke execute on function public.ingest_transaction(text, text, numeric, text, integer, text, timestamptz) from anon, authenticated;
revoke execute on function public.store_monobank_token(text) from anon, authenticated;
