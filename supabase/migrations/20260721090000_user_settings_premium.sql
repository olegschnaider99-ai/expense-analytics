-- U12: test-only premium toggle. No WayForPay/billing integration yet —
-- this is a self-service flag a user can flip on their own row, purely to
-- demonstrate the "premium unlocks a feature" flow (unlimited AI questions,
-- see app/api/ai-agent/route.ts). Real billing would replace the insert/
-- update policies below with a SECURITY DEFINER function driven by a
-- payment webhook, the same way monobank tokens are only ever written
-- through store_monobank_token().
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_premium boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users read their own settings"
  on public.user_settings
  for select
  using (user_id = (select auth.uid()));

create policy "Users create their own settings row"
  on public.user_settings
  for insert
  with check (user_id = (select auth.uid()));

create policy "Users update their own settings"
  on public.user_settings
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
