import type { ThirtyDaySummary } from "@/lib/dashboard/data";

function formatUah(amount: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(amount);
}

function Card({
  label,
  value,
  sublabel,
  valueClassName,
}: {
  label: string;
  value: string;
  sublabel?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${valueClassName ?? ""}`}>
        {value}
      </span>
      {sublabel ? (
        <span className="truncate text-xs text-gray-400 dark:text-gray-500">{sublabel}</span>
      ) : null}
    </div>
  );
}

export function MetricCards({ summary }: { summary: ThirtyDaySummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card label="Витрачено за 30 днів" value={formatUah(summary.spent)} />
      <Card
        label="Надходження"
        value={formatUah(summary.income)}
        valueClassName="text-green-600 dark:text-green-500"
      />
      <Card
        label="Найбільша витрата"
        value={summary.biggestExpense ? formatUah(Math.abs(summary.biggestExpense.amount)) : "—"}
        sublabel={summary.biggestExpense?.description ?? undefined}
      />
      <Card label="Транзакцій" value={String(summary.transactionCount)} />
    </div>
  );
}
