import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

/**
 * Integration test against the deployed monobank-webhook Edge Function
 * (no local Docker stack available — see supabase/tests/schema.test.ts).
 * Sets up a real user + connection fixture, then POSTs Monobank-shaped
 * payloads at the live function URL.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
const functionUrl = `${url}/functions/v1/monobank-webhook`;

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = Date.now();
const email = `webhook-test-${suffix}@example.com`;
const webhookSecretPath = randomBytes(32).toString("hex");

let userId: string;
let connectionId: string;

function statementPayload(overrides: Partial<{ id: string; amount: number }> = {}) {
  return {
    type: "StatementItem",
    data: {
      account: "test-account",
      statementItem: {
        id: overrides.id ?? "webhook-tx-1",
        time: Math.floor(Date.now() / 1000),
        description: "Test coffee shop",
        mcc: 5814,
        amount: overrides.amount ?? -8500,
        currencyCode: 980,
      },
    },
  };
}

beforeAll(async () => {
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password: "unused-fixture-password-12345!",
    email_confirm: true,
  });
  if (userError) throw userError;
  userId = userData.user!.id;

  const { data: secretId, error: secretError } = await admin.rpc(
    "store_monobank_token",
    { p_token: "fixture-webhook-token" },
  );
  if (secretError) throw secretError;

  const { data: connection, error: connError } = await admin
    .from("monobank_connections")
    .insert({
      user_id: userId,
      monobank_account_id: "test-account",
      token_secret_id: secretId,
      webhook_secret_path: webhookSecretPath,
    })
    .select()
    .single();
  if (connError) throw connError;
  connectionId = connection.id;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("monobank-webhook", () => {
  it("rejects a request with an invalid secret path without touching any table", async () => {
    const response = await fetch(`${functionUrl}/not-a-real-secret`, {
      method: "POST",
      body: JSON.stringify(statementPayload({ id: "should-not-exist" })),
    });
    expect(response.status).toBe(401);

    const { data } = await admin
      .from("transactions")
      .select("id")
      .eq("monobank_transaction_id", "should-not-exist");
    expect(data).toHaveLength(0);
  });

  it("persists a valid event and acks 200", async () => {
    const response = await fetch(`${functionUrl}/${webhookSecretPath}`, {
      method: "POST",
      body: JSON.stringify(statementPayload({ id: "webhook-tx-1" })),
    });
    expect(response.status).toBe(200);

    const { data } = await admin
      .from("transactions")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("monobank_transaction_id", "webhook-tx-1");
    expect(data).toHaveLength(1);
    expect(data![0].amount).toBe(-85);
  });

  it("is idempotent on redelivery of the same transaction id", async () => {
    await fetch(`${functionUrl}/${webhookSecretPath}`, {
      method: "POST",
      body: JSON.stringify(statementPayload({ id: "webhook-tx-1" })),
    });

    const { data } = await admin
      .from("transactions")
      .select("id")
      .eq("connection_id", connectionId)
      .eq("monobank_transaction_id", "webhook-tx-1");
    expect(data).toHaveLength(1);
  });

  it("enqueues an aggregation request for the connection's user", async () => {
    const { data } = await admin
      .from("aggregation_queue")
      .select("user_id")
      .eq("user_id", userId);
    expect(data).toHaveLength(1);
  });

  it("rejects malformed JSON without a 500", async () => {
    const response = await fetch(`${functionUrl}/${webhookSecretPath}`, {
      method: "POST",
      body: "not json",
    });
    expect(response.status).toBe(400);
  });
});
