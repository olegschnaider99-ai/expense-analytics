-- vault.secrets is not exposed via PostgREST, so both the app (U3, storing a
-- newly-submitted token) and tests (seeding a fixture token) need a wrapper
-- around vault.create_secret(). Restricted to service_role, same as the
-- other two privileged functions.
create or replace function public.store_monobank_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  v_secret_id := vault.create_secret(p_token);
  return v_secret_id;
end;
$$;

revoke all on function public.store_monobank_token(text) from public;
grant execute on function public.store_monobank_token(text) to service_role;
