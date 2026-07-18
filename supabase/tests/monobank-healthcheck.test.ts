import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Integration test against the deployed monobank-healthcheck function.
 * No real Monobank token is available in this environment, so these tests
 * exercise the parts that don't require one: the internal-secret gate, and
 * the Degraded -> NeedsReconnect state machine driven by a token that
 * genuinely fails against the real Monobank API (a fabricated token is
 * rejected by Monobank itself, which is enough to prove the degradation
 * path — reaching a "healthy" result would require a real personal token).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
const internalSecret = process.env.MONOBANK_HEALTHCHECK_SECRET!;
const functionUrl = `${url}/functions/v1/monobank-healthcheck`;

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = Date.now();
const email = `healthcheck-test-${suffix}@example.com`;
let userId: string;
let connectionId: string;

beforeAll(async () => {
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password: "unused-fixture-password-12345!",
    email_confirm: true,
  });
  if (userError) throw userError;
  userId = userData.user!.id;

  const { data: secretId } = await admin.rpc("store_monobank_token", {
    p_token: "definitely-not-a-real-monobank-token",
  });

  const { data: connection, error: connError } = await admin
    .from("monobank_connections")
    .insert({
      user_id: userId,
      monobank_account_id: "hc-test-account",
      token_secret_id: secretId,
      webhook_secret_path: `hc-whs-${suffix}`,
      connection_state: "Connected",
    })
    .select()
    .single();
  if (connError) throw connError;
  connectionId = connection.id;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("monobank-healthcheck", () => {
  it("rejects requests missing the internal secret", async () => {
    const response = await fetch(functionUrl, { method: "POST", body: "{}" });
    expect(response.status).toBe(403);
  });

  it("degrades a connection whose token Monobank rejects", async () => {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "x-internal-secret": internalSecret },
      body: "{}",
    });
    expect(response.status).toBe(200);

    const { data } = await admin
      .from("monobank_connections")
      .select("connection_state")
      .eq("id", connectionId)
      .single();
    expect(data!.connection_state).toBe("Degraded");
  });

  it("moves a still-failing Degraded connection to NeedsReconnect on the next check", async () => {
    await fetch(functionUrl, {
      method: "POST",
      headers: { "x-internal-secret": internalSecret },
      body: "{}",
    });

    const { data } = await admin
      .from("monobank_connections")
      .select("connection_state")
      .eq("id", connectionId)
      .single();
    expect(data!.connection_state).toBe("NeedsReconnect");
  });

  it("no longer re-checks a connection once it reaches NeedsReconnect", async () => {
    const before = await admin
      .from("monobank_connections")
      .select("state_changed_at")
      .eq("id", connectionId)
      .single();

    await fetch(functionUrl, {
      method: "POST",
      headers: { "x-internal-secret": internalSecret },
      body: "{}",
    });

    const after = await admin
      .from("monobank_connections")
      .select("state_changed_at, connection_state")
      .eq("id", connectionId)
      .single();

    expect(after.data!.connection_state).toBe("NeedsReconnect");
    expect(after.data!.state_changed_at).toBe(before.data!.state_changed_at);
  });
});
