-- U11: dashboard redesign needs per-transaction categories over an
-- arbitrary date window (30-day donut/trend/top-expenses), not just the
-- weekly pre-aggregated rows in `aggregates`. Wraps mcc_to_category() so
-- categorization logic still has a single source of truth. security
-- invoker (default) — runs as the calling role, so the existing
-- "Users read their own transactions" RLS policy still applies exactly as
-- it would for a direct select.
create or replace function public.get_categorized_transactions(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  amount numeric,
  currency text,
  mcc integer,
  category text,
  description text,
  occurred_at timestamptz,
  is_anomaly boolean
)
language sql
stable
as $$
  select t.id, t.amount, t.currency, t.mcc, mcc_to_category(t.mcc) as category,
         t.description, t.occurred_at, t.is_anomaly
  from public.transactions t
  where t.occurred_at >= p_from and t.occurred_at <= p_to
  order by t.occurred_at desc;
$$;

revoke all on function public.get_categorized_transactions(timestamptz, timestamptz) from public;
grant execute on function public.get_categorized_transactions(timestamptz, timestamptz) to authenticated;
