import Link from "next/link";
import type { DashboardConnection } from "@/lib/dashboard/data";

export function ConnectionBanner({
  connection,
}: {
  connection: DashboardConnection;
}) {
  if (connection.connection_state === "Connected") {
    return connection.history_gap_start ? (
      <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        У твоїй історії є пропуск між{" "}
        {new Date(connection.history_gap_start).toLocaleDateString()} і{" "}
        {new Date(connection.history_gap_end!).toLocaleDateString()} — Monobank
        не зміг відновити транзакції за цей період.
      </div>
    ) : null;
  }

  if (connection.connection_state === "Backfilling") {
    return (
      <div className="rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm text-blue-900">
        Синхронізуємо історію…
      </div>
    );
  }

  if (connection.connection_state === "Degraded") {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Виникають проблеми із синхронізацією з Monobank. Спостерігаємо — поки що нічого робити не треба.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
      <span>Твоє підключення до Monobank потребує уваги.</span>
      <Link href="/dashboard/reconnect" className="font-medium underline">
        Перепідключити
      </Link>
    </div>
  );
}
