import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

// U12/U13: the premium flag is a plain user-owned row (no SECURITY DEFINER
// function gating it — see supabase/migrations/20260721090000_user_settings_premium.sql)
// so RLS alone has to keep it isolated between users. This proves that
// directly against two real signed-in clients rather than mocking anything.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = Date.now();
const password = "test-password-do-not-use-in-prod-12345!";

let userAId: string;
let userBId: string;
let clientA: ReturnType<typeof createClient>;
let clientB: ReturnType<typeof createClient>;

async function signedInClient(email: string) {
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${signIn.session!.access_token}` } },
  });
}

beforeAll(async () => {
  const emailA = `user-settings-rls-a-${suffix}@example.com`;
  const emailB = `user-settings-rls-b-${suffix}@example.com`;

  const { data: userA, error: errorA } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  });
  if (errorA) throw errorA;
  userAId = userA.user!.id;

  const { data: userB, error: errorB } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  });
  if (errorB) throw errorB;
  userBId = userB.user!.id;

  clientA = await signedInClient(emailA);
  clientB = await signedInClient(emailB);
});

afterAll(async () => {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
});

describe("user_settings RLS", () => {
  it("lets a user upsert and read their own premium flag", async () => {
    const { error: upsertError } = await clientA
      .from("user_settings")
      .upsert({ user_id: userAId, is_premium: true });
    expect(upsertError).toBeNull();

    const { data } = await clientA
      .from("user_settings")
      .select("is_premium")
      .eq("user_id", userAId)
      .single();
    expect(data!.is_premium).toBe(true);
  });

  it("never returns another user's row via select, even with an explicit filter", async () => {
    await clientA.from("user_settings").upsert({ user_id: userAId, is_premium: true });

    const { data: viaOwnClient } = await clientB
      .from("user_settings")
      .select("*")
      .eq("user_id", userAId);
    expect(viaOwnClient).toEqual([]);

    const { data: allRowsForB } = await clientB.from("user_settings").select("*");
    expect(allRowsForB!.every((row) => row.user_id === userBId)).toBe(true);
  });

  it("blocks writing to another user's row (RLS check, not just select filtering)", async () => {
    await clientB.from("user_settings").upsert({ user_id: userBId, is_premium: false });

    const { error, data } = await clientA
      .from("user_settings")
      .update({ is_premium: true })
      .eq("user_id", userBId)
      .select();
    // RLS silently filters rather than erroring: zero rows matched/updated.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: stillFalse } = await admin
      .from("user_settings")
      .select("is_premium")
      .eq("user_id", userBId)
      .single();
    expect(stillFalse!.is_premium).toBe(false);
  });
});
