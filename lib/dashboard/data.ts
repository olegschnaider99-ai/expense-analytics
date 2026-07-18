import { createClient } from "@/lib/supabase/server";

export type ConnectionState = "Connected" | "Degraded" | "NeedsReconnect" | "Backfilling";

export type DashboardConnection = {
  id: string;
  connection_state: ConnectionState;
  created_at: string;
  history_gap_start: string | null;
  history_gap_end: string | null;
  other_jars: { id: string; currency: string }[];
};

export type CategoryAggregate = {
  category: string;
  total: number;
  transaction_count: number;
  prior_period_total: number | null;
  pct_change: number | null;
  is_anomaly: boolean;
};

export type RecentTransaction = {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  occurred_at: string;
  is_anomaly: boolean;
};

export type DashboardData = {
  connection: DashboardConnection | null;
  aggregates: CategoryAggregate[];
  recentTransactions: RecentTransaction[];
  /** True once >=31 days have passed since the connection was created. */
  hasFullHistoryWindow: boolean;
};

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const supabase = await createClient();

  const { data: connection } = await supabase
    .from("monobank_connections")
    .select(
      "id, connection_state, created_at, history_gap_start, history_gap_end, other_jars",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return {
      connection: null,
      aggregates: [],
      recentTransactions: [],
      hasFullHistoryWindow: false,
    };
  }

  const { data: aggregates } = await supabase
    .from("aggregates")
    .select("category, total, transaction_count, prior_period_total, pct_change, is_anomaly")
    .eq("user_id", userId)
    .order("total", { ascending: false });

  const { data: recentTransactions } = await supabase
    .from("transactions")
    .select("id, amount, currency, description, occurred_at, is_anomaly")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(10);

  const connectedSince = new Date(connection.created_at).getTime();
  const hasFullHistoryWindow = Date.now() - connectedSince >= THIRTY_ONE_DAYS_MS;

  return {
    connection: connection as DashboardConnection,
    aggregates: (aggregates ?? []) as CategoryAggregate[],
    recentTransactions: (recentTransactions ?? []) as RecentTransaction[],
    hasFullHistoryWindow,
  };
}
