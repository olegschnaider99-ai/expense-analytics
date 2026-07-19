import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const suffix = Date.now();
let userId: string;

async function quotaRow() {
  const { data } = await admin
    .from("ai_quota_usage")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data!;
}

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `ai-quota-test-${suffix}@example.com`,
    password: "unused-fixture-password-12345!",
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user!.id;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("reserve_ai_quota / complete_ai_quota / release_ai_quota", () => {
  it("reserves up to the daily limit and rejects beyond it", async () => {
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      const { data: ok } = await admin.rpc("reserve_ai_quota", {
        p_user_id: userId,
        p_daily_limit: limit,
      });
      expect(ok).toBe(true);
    }

    const { data: rejected } = await admin.rpc("reserve_ai_quota", {
      p_user_id: userId,
      p_daily_limit: limit,
    });
    expect(rejected).toBe(false);

    const row = await quotaRow();
    expect(row.reserved_count).toBe(limit);
  });

  it("complete_ai_quota increments completed_count without touching reserved_count", async () => {
    const before = await quotaRow();
    await admin.rpc("complete_ai_quota", { p_user_id: userId });
    const after = await quotaRow();
    expect(after.completed_count).toBe(before.completed_count + 1);
    expect(after.reserved_count).toBe(before.reserved_count);
  });

  it("release_ai_quota decrements reserved_count, freeing a slot", async () => {
    const before = await quotaRow();
    await admin.rpc("release_ai_quota", { p_user_id: userId });
    const afterRelease = await quotaRow();
    expect(afterRelease.reserved_count).toBe(before.reserved_count - 1);

    const { data: ok } = await admin.rpc("reserve_ai_quota", {
      p_user_id: userId,
      p_daily_limit: before.reserved_count, // the slot release_ai_quota just freed
    });
    expect(ok).toBe(true);
  });

  it("release_ai_quota never takes reserved_count below zero", async () => {
    const freshUser = (
      await admin.auth.admin.createUser({
        email: `ai-quota-floor-test-${suffix}@example.com`,
        password: "unused-fixture-password-12345!",
        email_confirm: true,
      })
    ).data.user!.id;

    await admin.rpc("release_ai_quota", { p_user_id: freshUser });
    const { data } = await admin
      .from("ai_quota_usage")
      .select("reserved_count")
      .eq("user_id", freshUser)
      .maybeSingle();
    // No row exists yet (release on a user with no reservation today is a no-op)
    expect(data).toBeNull();

    await admin.auth.admin.deleteUser(freshUser);
  });
});
