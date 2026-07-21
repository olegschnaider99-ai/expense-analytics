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

export type CategoryTotal = {
  category: string;
  total: number;
  pct: number;
};

export type DailyTotal = {
  date: string;
  total: number;
};

export type TopExpense = {
  id: string;
  description: string | null;
  amount: number;
  currency: string;
  category: string;
  occurred_at: string;
};

export type ThirtyDaySummary = {
  spent: number;
  income: number;
  biggestExpense: TopExpense | null;
  transactionCount: number;
  categoryTotals: CategoryTotal[];
  dailyTotals: DailyTotal[];
  topExpenses: TopExpense[];
};

export type DashboardData = {
  connection: DashboardConnection | null;
  aggregates: CategoryAggregate[];
  recentTransactions: RecentTransaction[];
  summary: ThirtyDaySummary;
  /** True once >=31 days have passed since the connection was created. */
  hasFullHistoryWindow: boolean;
  isPremium: boolean;
};

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY_SUMMARY: ThirtyDaySummary = {
  spent: 0,
  income: 0,
  biggestExpense: null,
  transactionCount: 0,
  categoryTotals: [],
  dailyTotals: [],
  topExpenses: [],
};

type CategorizedTransactionRow = {
  id: string;
  amount: number;
  currency: string;
  category: string;
  description: string | null;
  occurred_at: string;
  is_anomaly: boolean;
};

function computeThirtyDaySummary(rows: CategorizedTransactionRow[]): ThirtyDaySummary {
  if (rows.length === 0) return EMPTY_SUMMARY;

  let spent = 0;
  let income = 0;
  const categorySums = new Map<string, number>();
  const dailySums = new Map<string, number>();
  let biggestExpense: TopExpense | null = null;

  for (const row of rows) {
    const amount = Number(row.amount);
    const date = row.occurred_at.slice(0, 10);

    if (amount < 0) {
      const spend = Math.abs(amount);
      spent += spend;
      categorySums.set(row.category, (categorySums.get(row.category) ?? 0) + spend);
      dailySums.set(date, (dailySums.get(date) ?? 0) + spend);
      if (!biggestExpense || spend > Math.abs(biggestExpense.amount)) {
        biggestExpense = {
          id: row.id,
          description: row.description,
          amount,
          currency: row.currency,
          category: row.category,
          occurred_at: row.occurred_at,
        };
      }
    } else {
      income += amount;
    }
  }

  const categoryTotals: CategoryTotal[] = [...categorySums.entries()]
    .map(([category, total]) => ({
      category,
      total,
      pct: spent > 0 ? Math.round((total / spent) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const dailyTotals: DailyTotal[] = [...dailySums.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topExpenses: TopExpense[] = rows
    .filter((row) => Number(row.amount) < 0)
    .sort((a, b) => Math.abs(Number(a.amount)) - Math.abs(Number(b.amount)))
    .reverse()
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      category: row.category,
      occurred_at: row.occurred_at,
    }));

  return {
    spent,
    income,
    biggestExpense,
    transactionCount: rows.length,
    categoryTotals,
    dailyTotals,
    topExpenses,
  };
}

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

  const { data: settings } = await supabase
    .from("user_settings")
    .select("is_premium")
    .eq("user_id", userId)
    .maybeSingle();
  const isPremium = settings?.is_premium ?? false;

  if (!connection) {
    return {
      connection: null,
      aggregates: [],
      recentTransactions: [],
      summary: EMPTY_SUMMARY,
      hasFullHistoryWindow: false,
      isPremium,
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

  const now = new Date();
  const { data: categorizedTransactions } = await supabase.rpc(
    "get_categorized_transactions",
    {
      p_from: new Date(now.getTime() - THIRTY_DAYS_MS).toISOString(),
      p_to: now.toISOString(),
    },
  );

  const connectedSince = new Date(connection.created_at).getTime();
  const hasFullHistoryWindow = Date.now() - connectedSince >= THIRTY_ONE_DAYS_MS;

  return {
    connection: connection as DashboardConnection,
    aggregates: (aggregates ?? []) as CategoryAggregate[],
    recentTransactions: (recentTransactions ?? []) as RecentTransaction[],
    summary: computeThirtyDaySummary(
      (categorizedTransactions ?? []) as CategorizedTransactionRow[],
    ),
    hasFullHistoryWindow,
    isPremium,
  };
}
