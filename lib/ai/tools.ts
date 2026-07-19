import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

/**
 * Every tool here runs its query through `supabase` as-is — a client
 * carrying the *requesting user's* session, never a service-role client.
 * That's what keeps `search_transactions` (the most flexible tool, and the
 * one most exposed to whatever the model decides to pass as arguments)
 * from being able to read another user's rows: RLS enforces the boundary
 * regardless of what the tool call asks for.
 */
export function createTools(supabase: SupabaseClient): AgentTool[] {
  const getCategoryTotals: AgentTool = {
    name: "get_category_totals",
    description:
      "Current-week spending totals per category, with the prior week's total and percent change. This is the precomputed, fast source for 'what did I spend on X' and 'how much on groceries' style questions about the last 7 days.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => {
      const { data, error } = await supabase
        .from("aggregates")
        .select("category, total, transaction_count, prior_period_total, pct_change, is_anomaly")
        .order("total", { ascending: false });
      if (error) return `Error: ${error.message}`;
      return JSON.stringify(data);
    },
  };

  const comparePeriods: AgentTool = {
    name: "compare_periods",
    description:
      "Total spending across ALL categories for two arbitrary date ranges (e.g. this month vs last month), with percent change. Use this for period-comparison questions that don't fit the fixed current/prior-week window get_category_totals covers.",
    parameters: {
      type: "object",
      properties: {
        current_start: { type: "string", description: "ISO date, inclusive" },
        current_end: { type: "string", description: "ISO date, inclusive" },
        prior_start: { type: "string", description: "ISO date, inclusive" },
        prior_end: { type: "string", description: "ISO date, inclusive" },
      },
      required: ["current_start", "current_end", "prior_start", "prior_end"],
    },
    execute: async (args) => {
      const { current_start, current_end, prior_start, prior_end } = args as Record<string, string>;
      const sumRange = async (start: string, end: string) => {
        const { data, error } = await supabase
          .from("transactions")
          .select("amount")
          .lt("amount", 0)
          .gte("occurred_at", start)
          .lte("occurred_at", `${end}T23:59:59`);
        if (error) throw new Error(error.message);
        return data.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
      };

      try {
        const currentTotal = await sumRange(current_start, current_end);
        const priorTotal = await sumRange(prior_start, prior_end);
        const pctChange =
          priorTotal === 0 ? null : Math.round(((currentTotal - priorTotal) / priorTotal) * 1000) / 10;
        return JSON.stringify({ currentTotal, priorTotal, pctChange });
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : "unknown error"}`;
      }
    },
  };

  const topMerchants: AgentTool = {
    name: "top_merchants",
    description:
      "Top merchants/descriptions by total spend over a trailing window of days. Use for 'where do I spend the most' style questions.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Trailing window size in days" },
        limit: { type: "number", description: "Max merchants to return (default 5)" },
      },
      required: ["days"],
    },
    execute: async (args) => {
      const { days, limit } = args as { days: number; limit?: number };
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("transactions")
        .select("description, amount")
        .lt("amount", 0)
        .gte("occurred_at", since);
      if (error) return `Error: ${error.message}`;

      const totals = new Map<string, number>();
      for (const row of data) {
        const key = row.description ?? "Unknown";
        totals.set(key, (totals.get(key) ?? 0) + Math.abs(Number(row.amount)));
      }
      const ranked = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit ?? 5)
        .map(([description, total]) => ({ description, total }));
      return JSON.stringify(ranked);
    },
  };

  const searchTransactions: AgentTool = {
    name: "search_transactions",
    description:
      "Open-ended fallback search over raw transactions for questions the other tools don't cover directly — e.g. 'what was my most unusual purchase', or a specific merchant/date lookup. All filters are optional and combine with AND.",
    parameters: {
      type: "object",
      properties: {
        description_contains: { type: "string", description: "Case-insensitive substring match on the merchant/description" },
        days: { type: "number", description: "Only include transactions from the trailing N days" },
        only_anomalies: { type: "boolean", description: "Only include transactions flagged as unusual" },
        limit: { type: "number", description: "Max rows to return (default 20)" },
      },
      required: [],
    },
    execute: async (args) => {
      const { description_contains, days, only_anomalies, limit } = args as {
        description_contains?: string;
        days?: number;
        only_anomalies?: boolean;
        limit?: number;
      };

      let query = supabase
        .from("transactions")
        .select("description, amount, currency, occurred_at, is_anomaly")
        .lt("amount", 0)
        .order("amount", { ascending: true })
        .limit(limit ?? 20);

      if (description_contains) {
        query = query.ilike("description", `%${description_contains}%`);
      }
      if (days) {
        query = query.gte("occurred_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
      }
      if (only_anomalies) {
        query = query.eq("is_anomaly", true);
      }

      const { data, error } = await query;
      if (error) return `Error: ${error.message}`;
      return JSON.stringify(data);
    },
  };

  return [getCategoryTotals, comparePeriods, topMerchants, searchTransactions];
}
