import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { answerQuestion } from "./agent";

/**
 * Live end-to-end test against the real OpenAI API and the real Supabase
 * project. Confirms the full tool-calling loop grounds its answer in
 * fixture data rather than the model's own guess.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = Date.now();
const email = `ai-agent-test-${suffix}@example.com`;
const password = "test-password-do-not-use-in-prod-12345!";

let userId: string;
let userClient: ReturnType<typeof createClient>;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

beforeAll(async () => {
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw userError;
  userId = userData.user!.id;

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${signIn.session!.access_token}` },
    },
  });

  const { data: secretId } = await admin.rpc("store_monobank_token", {
    p_token: "fixture-token",
  });
  const { data: connection } = await admin
    .from("monobank_connections")
    .insert({
      user_id: userId,
      monobank_account_id: "ai-agent-account",
      token_secret_id: secretId,
      webhook_secret_path: `ai-agent-whs-${suffix}`,
    })
    .select()
    .single();

  await admin.from("transactions").insert({
    user_id: userId,
    connection_id: connection!.id,
    monobank_transaction_id: "agent-tx-1",
    amount: -777,
    currency: "UAH",
    mcc: 5541,
    description: "Fixture Gas Station",
    occurred_at: daysAgo(1),
  });
  await admin.rpc("recompute_user_aggregates", { p_user_id: userId });
}, 30000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("answerQuestion (live OpenAI + Supabase)", () => {
  it(
    "grounds its answer in the actual fixture transaction, not a guess",
    async () => {
      const answer = await answerQuestion(
        userClient,
        "What category did I spend the most on this week, and how much?",
        [],
      );
      expect(answer.toLowerCase()).toContain("пальне");
      expect(answer).toContain("777");
    },
    30000,
  );
});
