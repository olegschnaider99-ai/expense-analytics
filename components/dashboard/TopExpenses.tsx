import type { TopExpense } from "@/lib/dashboard/data";
import { categoryStyle } from "@/lib/dashboard/categories";

function formatUah(amount: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function TopExpenses({ expenses }: { expenses: TopExpense[] }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-semibold">Топ-5 витрат</h2>
        <p className="text-xs text-gray-400">Найбільші покупки за 30 днів</p>
      </div>

      {expenses.length === 0 ? (
        <p className="text-sm text-gray-500">Ще немає даних.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-zinc-800">
          {expenses.map((expense) => {
            const style = categoryStyle(expense.category);
            return (
              <li key={expense.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800">
                  {style.emoji}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {expense.description ?? "Невідомо"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {expense.category} ·{" "}
                    {new Date(expense.occurred_at).toLocaleDateString("uk-UA", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                <span className="shrink-0 tabular-nums text-gray-900 dark:text-gray-100">
                  {formatUah(expense.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
