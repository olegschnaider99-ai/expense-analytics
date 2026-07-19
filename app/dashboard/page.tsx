import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard/data";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ConnectionBanner } from "@/components/dashboard/ConnectionBanner";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { CategoryDonut } from "@/components/dashboard/CategoryDonut";
import { DailyTrendChart } from "@/components/dashboard/DailyTrendChart";
import { TopExpenses } from "@/components/dashboard/TopExpenses";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { JarList } from "@/components/dashboard/JarList";
import { AiPanel } from "@/components/dashboard/AiPanel";

export default async function DashboardPage() {
  const user = await getVerifiedUser();
  if (!user) {
    redirect("/login");
  }

  const { connection, recentTransactions, summary, hasFullHistoryWindow } =
    await getDashboardData(user.sub as string);

  if (!connection) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 p-8 text-center">
        <h1 className="text-xl font-medium">Підключи Monobank</h1>
        <p className="text-sm text-gray-600">
          Підключи свій рахунок, щоб побачити тут свої витрати.
        </p>
        <Link
          href="/dashboard/connect"
          className="rounded bg-black px-3 py-2 text-sm text-white"
        >
          Підключити Monobank
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col bg-gray-50 md:flex-row dark:bg-black">
      <Sidebar />

      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Дашборд</h1>
          <span
            title="Скоро"
            className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-400"
          >
            👑 Premium
          </span>
        </div>

        <ConnectionBanner connection={connection} />

        <MetricCards summary={summary} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CategoryDonut
            categoryTotals={summary.categoryTotals}
            spent={summary.spent}
            hasFullHistoryWindow={hasFullHistoryWindow}
          />
          <DailyTrendChart
            dailyTotals={summary.dailyTotals}
            hasFullHistoryWindow={hasFullHistoryWindow}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopExpenses expenses={summary.topExpenses} />
          <RecentTransactions transactions={recentTransactions} />
        </div>

        <JarList jars={connection.other_jars} />
      </main>

      <div id="ai-panel" className="contents">
        <AiPanel />
      </div>
    </div>
  );
}
