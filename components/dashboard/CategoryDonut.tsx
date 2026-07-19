import type { CategoryTotal } from "@/lib/dashboard/data";
import { categoryStyle } from "@/lib/dashboard/categories";

function formatUah(amount: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function CategoryDonut({
  categoryTotals,
  spent,
  hasFullHistoryWindow,
}: {
  categoryTotals: CategoryTotal[];
  spent: number;
  hasFullHistoryWindow: boolean;
}) {
  if (categoryTotals.length === 0) {
    return (
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">Витрати по категоріях</h2>
        <div className="flex flex-1 items-center justify-center rounded border border-dashed p-6 text-center text-sm text-gray-500 dark:border-zinc-700">
          {hasFullHistoryWindow
            ? "Витрат за останні 30 днів поки немає."
            : "Ще збираємо історію — тут з'явиться перший місяць твоїх витрат."}
        </div>
      </div>
    );
  }

  let cumulative = 0;
  const stops = categoryTotals.map((row) => {
    const start = (cumulative / spent) * 100;
    cumulative += row.total;
    const end = (cumulative / spent) * 100;
    return `${categoryStyle(row.category).color} ${start}% ${end}%`;
  });

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-semibold">Витрати по категоріях</h2>
        <p className="text-xs text-gray-400">Останні 30 днів</p>
      </div>

      <div className="flex flex-1 flex-col items-center gap-6 sm:flex-row">
        <div
          className="relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
        >
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center dark:bg-zinc-900">
            <span className="text-xs text-gray-400">Витрачено</span>
            <span className="text-sm font-semibold tabular-nums">{formatUah(spent)}</span>
          </div>
        </div>

        <ul className="flex min-w-0 w-full flex-col gap-2 text-sm">
          {categoryTotals.map((row) => {
            const style = categoryStyle(row.category);
            return (
              <li key={row.category} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: style.color }}
                  />
                  <span className="shrink-0">{style.emoji}</span>
                  <span className="min-w-0 truncate">{row.category}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-gray-700 dark:text-gray-300">
                    {formatUah(row.total)}
                  </span>
                  <span className="w-10 text-right text-xs text-gray-400">{row.pct}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
