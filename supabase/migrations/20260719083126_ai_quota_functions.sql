-- U9: free-tier AI-question quota. Reserve happens before the model call
-- starts (so a burst of concurrent requests can't all slip past the limit);
-- complete/release settle it afterward depending on outcome, so a failed
-- call never counts against the daily cap. The daily limit is passed in by
-- the caller (an env var), not hardcoded here, so it's tunable without a
-- migration.

create or replace function public.reserve_ai_quota(p_user_id uuid, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_reserved integer;
begin
  insert into public.ai_quota_usage (user_id, usage_date, reserved_count, completed_count)
  values (p_user_id, v_today, 0, 0)
  on conflict (user_id, usage_date) do nothing;

  update public.ai_quota_usage
  set reserved_count = reserved_count + 1
  where user_id = p_user_id
    and usage_date = v_today
    and reserved_count < p_daily_limit
  returning reserved_count into v_reserved;

  return v_reserved is not null;
end;
$$;

create or replace function public.complete_ai_quota(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_quota_usage
  set completed_count = completed_count + 1
  where user_id = p_user_id and usage_date = (now() at time zone 'utc')::date;
end;
$$;

create or replace function public.release_ai_quota(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_quota_usage
  set reserved_count = greatest(reserved_count - 1, 0)
  where user_id = p_user_id and usage_date = (now() at time zone 'utc')::date;
end;
$$;

revoke all on function public.reserve_ai_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_ai_quota(uuid) from public, anon, authenticated;
revoke all on function public.release_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_quota(uuid, integer) to service_role;
grant execute on function public.complete_ai_quota(uuid) to service_role;
grant execute on function public.release_ai_quota(uuid) to service_role;
