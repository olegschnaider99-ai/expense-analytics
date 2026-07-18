import type { CategoryAggregate } from "@/lib/dashboard/data";

function formatUah(amount: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function CategoryChart({
  aggregates,
  hasFullHistoryWindow,
}: {
  aggregates: CategoryAggregate[];
  hasFullHistoryWindow: boolean;
}) {
  if (aggregates.length === 0) {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
        {hasFullHistoryWindow
          ? "No spending recorded for this period yet."
          : "Still gathering history — your first month of spending will show up here."}
      </div>
    );
  }

  const maxTotal = Math.max(...aggregates.map((a) => a.total));

  return (
    <div className="flex flex-col gap-3">
      {!hasFullHistoryWindow ? (
        <p className="text-xs text-gray-500">
          Still gathering history — trends will fill in over your first month.
        </p>
      ) : null}
      {aggregates.map((row) => (
        <div key={row.category} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {row.category}
              {row.is_anomaly ? (
                <span
                  className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                  title="Contains an unusually large purchase"
                >
                  unusual
                </span>
              ) : null}
            </span>
            <span className="tabular-nums text-gray-700">
              {formatUah(row.total)}
              {row.pct_change === null ? (
                <span className="ml-2 text-xs text-gray-400">new category</span>
              ) : (
                <span
                  className={`ml-2 text-xs ${row.pct_change > 0 ? "text-red-600" : "text-green-600"}`}
                >
                  {row.pct_change > 0 ? "+" : ""}
                  {row.pct_change}%
                </span>
              )}
            </span>
          </div>
          <div className="h-2 rounded bg-gray-100">
            <div
              className="h-2 rounded bg-black"
              style={{ width: `${(row.total / maxTotal) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
