import type { RecentTransaction } from "@/lib/dashboard/data";

export function RecentTransactions({
  transactions,
}: {
  transactions: RecentTransaction[];
}) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-gray-500">Ще немає синхронізованих транзакцій.</p>
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {transactions.map((tx) => (
        <li key={tx.id} className="flex items-center justify-between py-2 text-sm">
          <div className="flex flex-col">
            <span>{tx.description ?? "Невідомо"}</span>
            <span className="text-xs text-gray-500">
              {new Date(tx.occurred_at).toLocaleDateString()}
              {tx.is_anomaly ? (
                <span className="ml-2 text-amber-700">незвично</span>
              ) : null}
            </span>
          </div>
          <span className={tx.amount < 0 ? "text-gray-900" : "text-green-700"}>
            {tx.amount > 0 ? "+" : ""}
            {tx.amount.toFixed(2)} {tx.currency}
          </span>
        </li>
      ))}
    </ul>
  );
}
