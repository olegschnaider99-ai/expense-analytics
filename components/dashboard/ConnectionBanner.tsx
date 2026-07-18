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
        There&apos;s a gap in your history between{" "}
        {new Date(connection.history_gap_start).toLocaleDateString()} and{" "}
        {new Date(connection.history_gap_end!).toLocaleDateString()} — Monobank
        couldn&apos;t recover transactions from that period.
      </div>
    ) : null;
  }

  if (connection.connection_state === "Backfilling") {
    return (
      <div className="rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm text-blue-900">
        Re-syncing your history…
      </div>
    );
  }

  if (connection.connection_state === "Degraded") {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Having trouble syncing with Monobank. Monitoring — no action needed yet.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
      <span>Your Monobank connection needs attention.</span>
      <Link href="/dashboard/reconnect" className="font-medium underline">
        Reconnect
      </Link>
    </div>
  );
}
