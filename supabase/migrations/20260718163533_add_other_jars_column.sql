-- U3 (R13/AE4): non-primary-currency jars are shown on the dashboard as
-- "not yet supported" rather than synced. Only the primary-currency account
-- gets a full connection (token, webhook); other jars are recorded here as
-- lightweight display data.
alter table public.monobank_connections
  add column if not exists other_jars jsonb not null default '[]'::jsonb;
