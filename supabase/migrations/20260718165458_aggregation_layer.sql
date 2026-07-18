-- U6: aggregation layer. Category totals and week-over-week comparison
-- live in `aggregates` (dashboard + AI agent both read from here — see
-- Key Technical Decisions). Anomaly detection flags individual
-- transactions directly (a per-purchase question, "what was unusual",
-- doesn't fit a per-category-period flag); `aggregates.is_anomaly` is
-- just "does this category/period contain a flagged transaction".

alter table public.transactions
  add column if not exists is_anomaly boolean not null default false;

-- Coarse MCC -> category mapping. Deliberately simple for MVP; unmapped
-- codes fall back to 'Other' rather than blocking aggregation.
create or replace function public.mcc_to_category(p_mcc integer)
returns text
language sql
immutable
as $$
  select case
    when p_mcc in (5411, 5412, 5422, 5441, 5451, 5462) then 'Groceries'
    when p_mcc between 5811 and 5814 then 'Restaurants & Cafes'
    when p_mcc in (4111, 4121, 4131, 4789) then 'Transport'
    when p_mcc in (5541, 5542) then 'Fuel'
    when p_mcc in (5311, 5651, 5661, 5691, 5699, 5732, 5733, 5734, 5735, 5945, 5947) then 'Shopping'
    when p_mcc in (4814, 4816, 4899, 4900) then 'Utilities & Bills'
    when p_mcc in (7832, 7841, 7922) then 'Entertainment'
    when p_mcc in (5912, 8011, 8021, 8031, 8041, 8042, 8049, 8050, 8062, 8071, 8099) then 'Health'
    else 'Other'
  end;
$$;

create or replace function public.recompute_user_aggregates(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_start date := current_date - 6;
  v_prior_start date := current_date - 13;
  v_prior_end date := current_date - 7;
  v_history_start timestamptz;
  v_eligible_for_anomaly boolean;
begin
  select min(occurred_at) into v_history_start
    from public.transactions where user_id = p_user_id;

  v_eligible_for_anomaly := v_history_start is not null
    and now() - v_history_start >= interval '30 days';

  with current_period as (
    select mcc_to_category(mcc) as category,
           sum(abs(amount)) as total,
           count(*) as tx_count
    from public.transactions
    where user_id = p_user_id
      and amount < 0
      and occurred_at::date between v_current_start and current_date
    group by mcc_to_category(mcc)
  ),
  prior_period as (
    select mcc_to_category(mcc) as category,
           sum(abs(amount)) as total
    from public.transactions
    where user_id = p_user_id
      and amount < 0
      and occurred_at::date between v_prior_start and v_prior_end
    group by mcc_to_category(mcc)
  ),
  anomaly_by_category as (
    select mcc_to_category(mcc) as category, bool_or(is_anomaly) as has_anomaly
    from public.transactions
    where user_id = p_user_id
      and occurred_at::date between v_current_start and current_date
    group by mcc_to_category(mcc)
  )
  insert into public.aggregates (
    user_id, category, period_start, period_end, total, transaction_count,
    prior_period_total, pct_change, is_anomaly, computed_at
  )
  select
    p_user_id,
    cp.category,
    v_current_start,
    current_date,
    cp.total,
    cp.tx_count,
    pp.total,
    case when pp.total is null or pp.total = 0 then null
         else round(((cp.total - pp.total) / pp.total) * 100, 1)
    end,
    coalesce(ab.has_anomaly, false),
    now()
  from current_period cp
  left join prior_period pp on pp.category = cp.category
  left join anomaly_by_category ab on ab.category = cp.category
  on conflict (user_id, category, period_start, period_end)
  do update set
    total = excluded.total,
    transaction_count = excluded.transaction_count,
    prior_period_total = excluded.prior_period_total,
    pct_change = excluded.pct_change,
    is_anomaly = excluded.is_anomaly,
    computed_at = excluded.computed_at;

  -- Anomaly flag: >2 std dev from a category's trailing (up to 90-day)
  -- mean. Gated on >=5 transactions in that category (undefined/zero
  -- stddev on tiny samples) and >=30 days of connected history (the
  -- ~2-month window before a fresh connection has a stable baseline).
  if v_eligible_for_anomaly then
    with stats as (
      select mcc_to_category(mcc) as category,
             avg(abs(amount)) as mean_amount,
             stddev_samp(abs(amount)) as stddev_amount,
             count(*) as sample_size
      from public.transactions
      where user_id = p_user_id
        and amount < 0
        and occurred_at >= now() - interval '90 days'
      group by mcc_to_category(mcc)
      having count(*) >= 5
    )
    update public.transactions t
    set is_anomaly = (abs(t.amount) > s.mean_amount + 2 * s.stddev_amount)
    from stats s
    where t.user_id = p_user_id
      and mcc_to_category(t.mcc) = s.category
      and t.amount < 0
      and s.stddev_amount > 0;
  end if;
end;
$$;

revoke all on function public.recompute_user_aggregates(uuid) from public, anon, authenticated;
grant execute on function public.recompute_user_aggregates(uuid) to service_role;

-- Drains aggregation_queue (U4 enqueues per ingest); idempotent, so running
-- it more often than needed is harmless. Called directly by U4 right after
-- a successful ingest (near-immediate case) and by pg_cron on a fixed
-- schedule as the safety net for anything that path missed.
create or replace function public.process_aggregation_queue()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_processed integer := 0;
begin
  for v_user in select user_id from public.aggregation_queue loop
    perform public.recompute_user_aggregates(v_user.user_id);
    delete from public.aggregation_queue where user_id = v_user.user_id;
    v_processed := v_processed + 1;
  end loop;
  return v_processed;
end;
$$;

revoke all on function public.process_aggregation_queue() from public, anon, authenticated;
grant execute on function public.process_aggregation_queue() to service_role;

select cron.schedule(
  'process-aggregation-queue',
  '*/5 * * * *',
  $$select public.process_aggregation_queue();$$
);
