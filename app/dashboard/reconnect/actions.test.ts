import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Same stubbing approach as app/dashboard/connect/actions.test.ts.

class RedirectSignal extends Error {
  constructor(public destination: string) {
    super("NEXT_REDIRECT");
  }
}

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectSignal(destination);
  },
}));

let fixtureUserId = "";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const client = createAdminClient();
    client.auth.getClaims = (async () => ({
      data: { claims: { sub: fixtureUserId } },
      error: null,
    })) as typeof client.auth.getClaims;
    return client;
  },
}));

const fixtureAccounts = [
  { id: "acct-uah", currencyCode: 980, balance: 100000, maskedPan: [], type: "black" },
];
const fixtureStatement = [
  {
    id: "tx-reconnect-1",
    time: Math.floor(Date.now() / 1000) - 3600,
    description: "Post-reconnect purchase",
    mcc: 5411,
    amount: -5000,
    currencyCode: 980,
  },
];

vi.mock("@/lib/monobank/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/monobank/client")>();
  return {
    ...actual,
    getClientInfo: vi.fn(async () => ({
      clientId: "fixture-client",
      name: "Fixture User",
      accounts: fixtureAccounts,
    })),
    getStatement: vi.fn(async () => fixtureStatement),
    setWebHook: vi.fn(async () => undefined),
  };
});

const { reconnectMonobank } = await import("./actions");

const admin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const suffix = Date.now();

beforeEach(() => {
  fixtureUserId = "";
});

afterAll(async () => {
  if (fixtureUserId) await admin.auth.admin.deleteUser(fixtureUserId);
});

async function createFixtureUser(emailSuffix: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `reconnect-test-${emailSuffix}@example.com`,
    password: "unused-fixture-password-12345!",
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

function formData(token: string) {
  const fd = new FormData();
  fd.set("token", token);
  return fd;
}

describe("reconnectMonobank", () => {
  it("records a history gap when the outage exceeded 31 days", async () => {
    fixtureUserId = await createFixtureUser(`${suffix}-gap`);

    const { data: secretId } = await admin.rpc("store_monobank_token", {
      p_token: "old-token",
    });
    const oldSecretPath = `old-whs-${suffix}`;
    const brokenSince = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

    const { data: connection } = await admin
      .from("monobank_connections")
      .insert({
        user_id: fixtureUserId,
        monobank_account_id: "acct-uah",
        token_secret_id: secretId,
        webhook_secret_path: oldSecretPath,
        connection_state: "NeedsReconnect",
      })
      .select()
      .single();

    // The state-change trigger stamps state_changed_at at insert time
    // (now()); backdate it directly to simulate a 40-day-old outage.
    await admin
      .from("monobank_connections")
      .update({ state_changed_at: brokenSince })
      .eq("id", connection!.id);

    await expect(
      reconnectMonobank({ error: null }, formData("new-token")),
    ).rejects.toThrow(RedirectSignal);

    const { data: updated } = await admin
      .from("monobank_connections")
      .select("*")
      .eq("id", connection!.id)
      .single();

    expect(updated!.connection_state).toBe("Connected");
    expect(updated!.webhook_secret_path).not.toBe(oldSecretPath);
    expect(updated!.history_gap_start).not.toBeNull();
    expect(updated!.history_gap_end).not.toBeNull();

    const { data: transactions } = await admin
      .from("transactions")
      .select("id")
      .eq("connection_id", connection!.id)
      .eq("monobank_transaction_id", "tx-reconnect-1");
    expect(transactions).toHaveLength(1);
  });

  it("does not record a history gap for a short outage", async () => {
    fixtureUserId = await createFixtureUser(`${suffix}-short`);

    const { data: secretId } = await admin.rpc("store_monobank_token", {
      p_token: "old-token-2",
    });

    const { data: connection } = await admin
      .from("monobank_connections")
      .insert({
        user_id: fixtureUserId,
        monobank_account_id: "acct-uah",
        token_secret_id: secretId,
        webhook_secret_path: `old-whs-2-${suffix}`,
        connection_state: "NeedsReconnect",
      })
      .select()
      .single();

    await expect(
      reconnectMonobank({ error: null }, formData("new-token-2")),
    ).rejects.toThrow(RedirectSignal);

    const { data: updated } = await admin
      .from("monobank_connections")
      .select("history_gap_start, history_gap_end, connection_state")
      .eq("id", connection!.id)
      .single();

    expect(updated!.connection_state).toBe("Connected");
    expect(updated!.history_gap_start).toBeNull();
    expect(updated!.history_gap_end).toBeNull();
  });
});
