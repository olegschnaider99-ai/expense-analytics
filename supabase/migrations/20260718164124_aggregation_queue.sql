-- U4/U6: ingest_transaction "enqueues aggregation as a separate job rather
-- than computing inline" by upserting a row here; U6's pg_cron job drains
-- this queue (and re-scans recently-queued users as a safety net for any
-- tick it misses). One row per user — a fresh ingest just bumps
-- requested_at rather than growing the queue.
create table if not exists public.aggregation_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.aggregation_queue enable row level security;
-- No policies: this table is internal to ingest_transaction and the
-- aggregation job (both SECURITY DEFINER / service_role), never read
-- directly by end users.

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

  insert into public.aggregation_queue (user_id, requested_at)
  values (v_connection.user_id, now())
  on conflict (user_id) do update set requested_at = excluded.requested_at;

  insert into public.credential_access_log (user_id, action, source)
  values (v_connection.user_id, 'ingest_transaction', 'monobank-webhook');
end;
$$;
