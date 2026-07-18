-- U5: track when connection_state last changed, so reconnect can tell how
-- long a connection was actually broken (Degraded/NeedsReconnect start) and
-- decide whether the outage exceeded Monobank's 31-day recoverable window.
alter table public.monobank_connections
  add column if not exists state_changed_at timestamptz not null default now();

create or replace function public.touch_connection_state_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.connection_state is distinct from old.connection_state then
    new.state_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_state_changed_at on public.monobank_connections;
create trigger set_state_changed_at
  before update on public.monobank_connections
  for each row
  execute function public.touch_connection_state_changed_at();
