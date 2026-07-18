-- U5: schedules the health-check job. The health-check itself is a Deno
-- Edge Function (fetch is simpler there than pg_net's async response
-- model); pg_cron only needs to fire the trigger, not consume a response,
-- so a fire-and-forget net.http_post is enough.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Generic Vault wrapper (parallel to store_monobank_token) so this
-- migration can seed the health-check trigger's shared secret by name,
-- without ever committing the secret value itself to a migration file —
-- it's seeded once operationally via `select seed_internal_secret(...)`.
create or replace function public.seed_internal_secret(p_name text, p_value text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing_id uuid;
  v_new_id uuid;
begin
  select id into v_existing_id from vault.secrets where name = p_name;

  if v_existing_id is not null then
    perform vault.update_secret(v_existing_id, p_value);
    return v_existing_id;
  end if;

  v_new_id := vault.create_secret(p_value, p_name);
  return v_new_id;
end;
$$;

revoke all on function public.seed_internal_secret(text, text) from public, anon, authenticated;
grant execute on function public.seed_internal_secret(text, text) to service_role;

select cron.schedule(
  'monobank-healthcheck',
  '0 * * * *', -- hourly — conservative, well under Monobank's ~1 call/60s guidance per connection
  $$
  select net.http_post(
    -- The project URL is public (matches NEXT_PUBLIC_SUPABASE_URL); only
    -- the x-internal-secret header below is sensitive.
    url := 'https://ucarbdnmeycvybqodahp.supabase.co/functions/v1/monobank-healthcheck',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'monobank_healthcheck_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
