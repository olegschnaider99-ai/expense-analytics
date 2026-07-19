-- Supabase grants EXECUTE on new public-schema functions to `anon` and
-- `authenticated` directly (separate from the `PUBLIC` pseudo-role), so the
-- previous migration's `revoke ... from public` alone left this callable by
-- anon. Same fix as restrict_privileged_functions.sql.
revoke all on function public.get_categorized_transactions(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_categorized_transactions(timestamptz, timestamptz) to authenticated;
