import type { DailyTotal } from "@/lib/dashboard/data";

function formatUah(amount: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

/** Fills in zero-spend days so the chart shows a continuous 30-day axis. */
function lastThirtyDays(dailyTotals: DailyTotal[]): DailyTotal[] {
  const byDate = new Map(dailyTotals.map((row) => [row.date, row.total]));
  const days: DailyTotal[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    days.push({ date, total: byDate.get(date) ?? 0 });
  }
  return days;
}

export function DailyTrendChart({
  dailyTotals,
  hasFullHistoryWindow,
}: {
  dailyTotals: DailyTotal[];
  hasFullHistoryWindow: boolean;
}) {
  if (dailyTotals.length === 0) {
    return (
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">Динаміка витрат</h2>
        <div className="flex flex-1 items-center justify-center rounded border border-dashed p-6 text-center text-sm text-gray-500 dark:border-zinc-700">
          {hasFullHistoryWindow
            ? "Витрат за останні 30 днів поки немає."
            : "Ще збираємо історію — тут з'явиться перший місяць твоїх витрат."}
        </div>
      </div>
    );
  }

  const days = lastThirtyDays(dailyTotals);
  const maxTotal = Math.max(...days.map((d) => d.total), 1);

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-semibold">Динаміка витрат</h2>
        <p className="text-xs text-gray-400">По днях, останні 30 днів</p>
      </div>

      <div className="flex h-40 items-end gap-[2px]">
        {days.map((day) => (
          <div
            key={day.date}
            title={`${formatDayMonth(day.date)}: ${formatUah(day.total)}`}
            className="flex-1 rounded-t bg-green-500/80 hover:bg-green-500 dark:bg-green-500/70"
            style={{ height: `${Math.max((day.total / maxTotal) * 100, day.total > 0 ? 4 : 1)}%` }}
          />
        ))}
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        {days
          .filter((_, index) => index % 5 === 0)
          .map((day) => (
            <span key={day.date}>{formatDayMonth(day.date)}</span>
          ))}
      </div>
    </div>
  );
}
