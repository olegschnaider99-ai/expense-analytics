import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/supabase/server";
import { signOut } from "@/lib/supabase/actions";
import { getDashboardData } from "@/lib/dashboard/data";
import { ConnectionBanner } from "@/components/dashboard/ConnectionBanner";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { JarList } from "@/components/dashboard/JarList";
import { AiPanel } from "@/components/dashboard/AiPanel";

export default async function DashboardPage() {
  const user = await getVerifiedUser();
  if (!user) {
    redirect("/login");
  }

  const { connection, aggregates, recentTransactions, hasFullHistoryWindow } =
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
    <div className="flex h-full min-h-screen flex-col md:flex-row">
      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-medium">Витрати</h1>
          <form action={signOut}>
            <button type="submit" className="text-sm text-gray-500 underline">
              Вийти
            </button>
          </form>
        </div>

        <ConnectionBanner connection={connection} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-700">
            Цей тиждень за категоріями
          </h2>
          <CategoryChart
            aggregates={aggregates}
            hasFullHistoryWindow={hasFullHistoryWindow}
          />
        </section>

        <JarList jars={connection.other_jars} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-700">
            Останні транзакції
          </h2>
          <RecentTransactions transactions={recentTransactions} />
        </section>
      </main>

      <AiPanel />
    </div>
  );
}
