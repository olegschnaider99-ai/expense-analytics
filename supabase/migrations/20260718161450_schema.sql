-- U1: Project scaffolding and data model
-- Tables, RLS, Vault-backed token storage, and the two SECURITY DEFINER
-- functions that are the only privileged write/decrypt paths in the system.

create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- monobank_connections
-- ---------------------------------------------------------------------------
create table if not exists public.monobank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  monobank_account_id text not null,
  is_primary_currency boolean not null default true,
  token_secret_id uuid not null references vault.secrets (id),
  webhook_secret_path text not null unique,
  connection_state text not null default 'Connected'
    check (connection_state in ('Connected', 'Degraded', 'NeedsReconnect', 'Backfilling')),
  history_gap_start timestamptz,
  history_gap_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, monobank_account_id)
);

alter table public.monobank_connections enable row level security;

create policy "Users manage their own connections"
  on public.monobank_connections
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.monobank_connections (id) on delete cascade,
  monobank_transaction_id text not null,
  amount numeric not null,
  currency text not null,
  mcc integer,
  description text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (connection_id, monobank_transaction_id)
);

alter table public.transactions enable row level security;

create policy "Users read their own transactions"
  on public.transactions
  for select
  using (user_id = (select auth.uid()));

-- No insert/update/delete policy for `authenticated` — all writes go through
-- ingest_transaction(), which runs as a SECURITY DEFINER function.

-- ---------------------------------------------------------------------------
-- aggregates
-- ---------------------------------------------------------------------------
create table if not exists public.aggregates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  period_start date not null,
  period_end date not null,
  total numeric not null default 0,
  transaction_count integer not null default 0,
  prior_period_total numeric,
  pct_change numeric,
  is_anomaly boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (user_id, category, period_start, period_end)
);

alter table public.aggregates enable row level security;

create policy "Users read their own aggregates"
  on public.aggregates
  for select
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ai_quota_usage
-- ---------------------------------------------------------------------------
create table if not exists public.ai_quota_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  reserved_count integer not null default 0,
  completed_count integer not null default 0,
  primary key (user_id, usage_date)
);

alter table public.ai_quota_usage enable row level security;

create policy "Users read their own quota usage"
  on public.ai_quota_usage
  for select
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- credential_access_log — audit trail for the two privileged functions below.
-- RLS allows a user to read their own rows; there is no insert/update/delete
-- policy for `authenticated`, so a user's own session cannot tamper with or
-- erase this log. Only the SECURITY DEFINER functions (which bypass RLS as
-- the function owner) can write to it.
-- ---------------------------------------------------------------------------
create table if not exists public.credential_access_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('decrypt_token', 'ingest_transaction')),
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.credential_access_log enable row level security;

create policy "Users read their own credential access log"
  on public.credential_access_log
  for select
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- decrypt_monobank_token — the only path that reads a plaintext Monobank
-- token out of Vault. Callers: U3 (initial validation) and U5 (health-check,
-- reconnect). Never exposed to `anon`/`authenticated` — a compromised user
-- session or the AI agent's own tool layer cannot call this.
-- ---------------------------------------------------------------------------
create or replace function public.decrypt_monobank_token(p_connection_id uuid, p_source text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_user_id uuid;
  v_token text;
begin
  select mc.user_id, vs.decrypted_secret
    into v_user_id, v_token
    from public.monobank_connections mc
    join vault.decrypted_secrets vs on vs.id = mc.token_secret_id
    where mc.id = p_connection_id;

  if v_token is null then
    raise exception 'connection not found';
  end if;

  insert into public.credential_access_log (user_id, action, source)
  values (v_user_id, 'decrypt_token', p_source);

  return v_token;
end;
$$;

revoke all on function public.decrypt_monobank_token(uuid, text) from public;
grant execute on function public.decrypt_monobank_token(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- ingest_transaction — the sole write path into `transactions`. Validates
-- the webhook secret against the connection before persisting, so a leaked
-- function credential can only invoke ingestion (never a raw table grant).
-- Idempotent via the (connection_id, monobank_transaction_id) unique
-- constraint, so webhook retries and backfill overlap upsert cleanly.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_transaction(
  p_webhook_secret_path text,
  p_monobank_transaction_id text,
  p_amount numeric,
  p_currency text,
  p_mcc integer,
  p_description text,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.monobank_connections%rowtype;
begin
  select * into v_connection
    from public.monobank_connections
    where webhook_secret_path = p_webhook_secret_path;

  if not found then
    raise exception 'invalid webhook secret';
  end if;

  insert into public.transactions (
    user_id, connection_id, monobank_transaction_id,
    amount, currency, mcc, description, occurred_at
  )
  values (
    v_connection.user_id, v_connection.id, p_monobank_transaction_id,
    p_amount, p_currency, p_mcc, p_description, p_occurred_at
  )
  on conflict (connection_id, monobank_transaction_id) do nothing;

  insert into public.credential_access_log (user_id, action, source)
  values (v_connection.user_id, 'ingest_transaction', 'monobank-webhook');
end;
$$;

revoke all on function public.ingest_transaction(text, text, numeric, text, integer, text, timestamptz) from public;
grant execute on function public.ingest_transaction(text, text, numeric, text, integer, text, timestamptz) to service_role;
