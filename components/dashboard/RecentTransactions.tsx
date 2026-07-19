import type { RecentTransaction } from "@/lib/dashboard/data";

export function RecentTransactions({
  transactions,
}: {
  transactions: RecentTransaction[];
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-semibold">Останні транзакції</h2>
        <p className="text-xs text-gray-400">Найсвіжіші операції</p>
      </div>

      {transactions.length === 0 ? (
        <p className="text-sm text-gray-500">Ще немає синхронізованих транзакцій.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-zinc-800">
          {transactions.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex flex-col">
                <span>{tx.description ?? "Невідомо"}</span>
                <span className="text-xs text-gray-400">
                  {new Date(tx.occurred_at).toLocaleDateString("uk-UA")}
                  {tx.is_anomaly ? (
                    <span className="ml-2 text-amber-700">незвично</span>
                  ) : null}
                </span>
              </div>
              <span
                className={
                  tx.amount < 0
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-green-600 dark:text-green-500"
                }
              >
                {tx.amount > 0 ? "+" : ""}
                {tx.amount.toFixed(2)} {tx.currency}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
