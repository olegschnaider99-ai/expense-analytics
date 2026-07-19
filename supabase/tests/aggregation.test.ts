import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = Date.now();
let userId: string;
let connectionId: string;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function insertTransaction(
  txId: string,
  amount: number,
  mcc: number,
  occurredAt: string,
) {
  const { error } = await admin.from("transactions").insert({
    user_id: userId,
    connection_id: connectionId,
    monobank_transaction_id: txId,
    amount,
    currency: "UAH",
    mcc,
    description: "fixture transaction",
    occurred_at: occurredAt,
  });
  if (error) throw error;
}

beforeAll(async () => {
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: `aggregation-test-${suffix}@example.com`,
    password: "unused-fixture-password-12345!",
    email_confirm: true,
  });
  if (userError) throw userError;
  userId = userData.user!.id;

  const { data: secretId } = await admin.rpc("store_monobank_token", {
    p_token: "fixture-token",
  });
  const { data: connection, error: connError } = await admin
    .from("monobank_connections")
    .insert({
      user_id: userId,
      monobank_account_id: "agg-test-account",
      token_secret_id: secretId,
      webhook_secret_path: `agg-whs-${suffix}`,
    })
    .select()
    .single();
  if (connError) throw connError;
  connectionId = connection.id;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("recompute_user_aggregates", () => {
  it("computes current vs prior week totals and pct_change per category", async () => {
    // Groceries (MCC 5411): 100 this week, 50 last week -> +100%
    await insertTransaction(`agg-cur-1-${suffix}`, -60, 5411, daysAgo(1));
    await insertTransaction(`agg-cur-2-${suffix}`, -40, 5411, daysAgo(2));
    await insertTransaction(`agg-prior-1-${suffix}`, -50, 5411, daysAgo(10));

    const { error } = await admin.rpc("recompute_user_aggregates", {
      p_user_id: userId,
    });
    expect(error).toBeNull();

    const { data: aggregate } = await admin
      .from("aggregates")
      .select("*")
      .eq("user_id", userId)
      .eq("category", "Продукти")
      .single();

    expect(Number(aggregate!.total)).toBe(100);
    expect(Number(aggregate!.prior_period_total)).toBe(50);
    expect(Number(aggregate!.pct_change)).toBe(100);
    expect(aggregate!.transaction_count).toBe(2);
  });

  it("renders a null pct_change for a category with no prior-period spending", async () => {
    await insertTransaction(`agg-new-cat-${suffix}`, -30, 5541, daysAgo(1)); // Fuel, no prior data

    await admin.rpc("recompute_user_aggregates", { p_user_id: userId });

    const { data: aggregate } = await admin
      .from("aggregates")
      .select("pct_change")
      .eq("user_id", userId)
      .eq("category", "Пальне")
      .single();

    expect(aggregate!.pct_change).toBeNull();
  });

  it("does not flag anomalies before 30 days of connected history", async () => {
    // All fixture data above is recent (<30 days), so the user isn't
    // eligible yet regardless of sample size.
    const { data: transactions } = await admin
      .from("transactions")
      .select("is_anomaly")
      .eq("user_id", userId);

    expect(transactions!.every((t) => t.is_anomaly === false)).toBe(true);
  });

  it("flags a >2-stddev transaction once eligible (30+ days history, 5+ samples)", async () => {
    const anomalyUser = (
      await admin.auth.admin.createUser({
        email: `aggregation-anomaly-test-${suffix}@example.com`,
        password: "unused-fixture-password-12345!",
        email_confirm: true,
      })
    ).data.user!.id;

    const { data: secretId } = await admin.rpc("store_monobank_token", {
      p_token: "fixture-token-2",
    });
    const { data: connection } = await admin
      .from("monobank_connections")
      .insert({
        user_id: anomalyUser,
        monobank_account_id: "agg-anomaly-account",
        token_secret_id: secretId,
        webhook_secret_path: `agg-anomaly-whs-${suffix}`,
      })
      .select()
      .single();

    const insert = async (txId: string, amount: number, daysBack: number) => {
      await admin.from("transactions").insert({
        user_id: anomalyUser,
        connection_id: connection!.id,
        monobank_transaction_id: txId,
        amount,
        currency: "UAH",
        mcc: 5811,
        description: "fixture",
        occurred_at: daysAgo(daysBack),
      });
    };

    // 5 normal-sized transactions spread across 40 days (>=30-day history),
    // plus one outlier far above the rest.
    await insert("anom-1", -20, 40);
    await insert("anom-2", -22, 35);
    await insert("anom-3", -18, 20);
    await insert("anom-4", -21, 10);
    await insert("anom-5", -19, 2);
    await insert("anom-outlier", -500, 1);

    await admin.rpc("recompute_user_aggregates", { p_user_id: anomalyUser });

    const { data: outlier } = await admin
      .from("transactions")
      .select("is_anomaly")
      .eq("user_id", anomalyUser)
      .eq("monobank_transaction_id", "anom-outlier")
      .single();
    const { data: normal } = await admin
      .from("transactions")
      .select("is_anomaly")
      .eq("user_id", anomalyUser)
      .eq("monobank_transaction_id", "anom-1")
      .single();

    expect(outlier!.is_anomaly).toBe(true);
    expect(normal!.is_anomaly).toBe(false);

    await admin.auth.admin.deleteUser(anomalyUser);
  });
});

describe("process_aggregation_queue", () => {
  it("drains queued users and clears the queue", async () => {
    await admin
      .from("aggregation_queue")
      .upsert({ user_id: userId, requested_at: new Date().toISOString() });

    const { data: processedCount, error } = await admin.rpc(
      "process_aggregation_queue",
    );
    expect(error).toBeNull();
    expect(processedCount).toBeGreaterThanOrEqual(1);

    const { data: remaining } = await admin
      .from("aggregation_queue")
      .select("user_id")
      .eq("user_id", userId);
    expect(remaining).toHaveLength(0);
  });
});
