import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration test against the live Supabase project (no local Docker stack
 * available in this environment). Verifies the invariants U1 exists to
 * guarantee: cross-user RLS isolation, the unique constraint backing
 * ingest_transaction's idempotency, and that the two SECURITY DEFINER
 * functions are unreachable by anon/authenticated roles.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createTestUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function signIn(email: string, password: string) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

const suffix = Date.now();
const userAEmail = `rls-test-a-${suffix}@example.com`;
const userBEmail = `rls-test-b-${suffix}@example.com`;
const password = "test-password-do-not-use-in-prod-12345!";

let userAId: string;
let userBId: string;
let connectionId: string;

beforeAll(async () => {
  const userA = await createTestUser(userAEmail, password);
  const userB = await createTestUser(userBEmail, password);
  userAId = userA!.id;
  userBId = userB!.id;
});

afterAll(async () => {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
});

describe("monobank_connections RLS", () => {
  it("lets a user create and read their own connection, and hides it from another user", async () => {
    const clientA = await signIn(userAEmail, password);

    const { data: secretId, error: secretError } = await admin.rpc(
      "store_monobank_token",
      { p_token: "test-monobank-token" },
    );
    expect(secretError).toBeNull();

    const { data: connection, error: insertError } = await clientA
      .from("monobank_connections")
      .insert({
        user_id: userAId,
        monobank_account_id: "acct-1",
        token_secret_id: secretId,
        webhook_secret_path: `whs-${suffix}`,
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(connection).not.toBeNull();
    connectionId = connection!.id;

    const { data: ownRead } = await clientA
      .from("monobank_connections")
      .select("id")
      .eq("id", connectionId);
    expect(ownRead).toHaveLength(1);

    const clientB = await signIn(userBEmail, password);
    const { data: crossRead } = await clientB
      .from("monobank_connections")
      .select("id")
      .eq("id", connectionId);
    expect(crossRead).toHaveLength(0);
  });
});

describe("transactions", () => {
  it("rejects a direct insert from an authenticated client (no write policy)", async () => {
    const clientA = await signIn(userAEmail, password);
    const { error } = await clientA.from("transactions").insert({
      user_id: userAId,
      connection_id: connectionId,
      monobank_transaction_id: "tx-1",
      amount: 100,
      currency: "UAH",
      occurred_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("ingest_transaction upserts idempotently on duplicate monobank_transaction_id", async () => {
    const payload = {
      p_webhook_secret_path: `whs-${suffix}`,
      p_monobank_transaction_id: "tx-dup-1",
      p_amount: 42.5,
      p_currency: "UAH",
      p_mcc: 5411,
      p_description: "Test grocery purchase",
      p_occurred_at: new Date().toISOString(),
    };

    const first = await admin.rpc("ingest_transaction", payload);
    const second = await admin.rpc("ingest_transaction", payload);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const { data: rows } = await admin
      .from("transactions")
      .select("id")
      .eq("connection_id", connectionId)
      .eq("monobank_transaction_id", "tx-dup-1");
    expect(rows).toHaveLength(1);
  });
});

describe("privileged functions are not reachable by end users", () => {
  it("rejects decrypt_monobank_token when called as an authenticated user", async () => {
    const clientA = await signIn(userAEmail, password);
    const { error } = await clientA.rpc("decrypt_monobank_token", {
      p_connection_id: connectionId,
      p_source: "test",
    });
    expect(error).not.toBeNull();
  });

  it("rejects ingest_transaction when called as an authenticated user", async () => {
    const clientA = await signIn(userAEmail, password);
    const { error } = await clientA.rpc("ingest_transaction", {
      p_webhook_secret_path: `whs-${suffix}`,
      p_monobank_transaction_id: "tx-forged",
      p_amount: 1,
      p_currency: "UAH",
      p_mcc: null,
      p_description: null,
      p_occurred_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });
});

describe("credential_access_log", () => {
  it("has no write policy for authenticated users (tamper protection)", async () => {
    const clientA = await signIn(userAEmail, password);
    const { error } = await clientA.from("credential_access_log").insert({
      user_id: userAId,
      action: "ingest_transaction",
      source: "forged",
    });
    expect(error).not.toBeNull();
  });

  it("recorded a row from the ingest_transaction calls above", async () => {
    const { data: rows } = await admin
      .from("credential_access_log")
      .select("id")
      .eq("user_id", userAId)
      .eq("action", "ingest_transaction");
    expect(rows!.length).toBeGreaterThan(0);
  });
});
