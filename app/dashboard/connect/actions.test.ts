import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// This environment has no real Monobank personal token to test against, so
// client-info/statement/webhook responses are fixtures. `@/lib/supabase/server`
// is also stubbed rather than faked-cookie'd: reproducing @supabase/ssr's
// exact cookie wire format (chunking, base64url + JSON prefix, auth-js's
// internal session shape) is significant surface to get right just to
// prove a session exists. Instead, the stub returns a real Supabase client
// (bypassing RLS, same as the admin client) with `.auth.getClaims()`
// patched to resolve the fixture user's claims — this exercises the real
// insert/RPC calls against the live project while keeping the auth check
// itself a simple, direct fixture.

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
  { id: "acct-usd", currencyCode: 840, balance: 5000, maskedPan: [], type: "black" },
];

const fixtureStatement = [
  {
    id: "tx-fixture-1",
    time: Math.floor(Date.now() / 1000) - 3600,
    description: "Test grocery run",
    mcc: 5411,
    amount: -15000,
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

const { connectMonobank } = await import("./actions");

const admin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const suffix = Date.now();
const email = `connect-test-${suffix}@example.com`;

beforeEach(() => {
  fixtureUserId = "";
});

afterAll(async () => {
  if (fixtureUserId) await admin.auth.admin.deleteUser(fixtureUserId);
});

describe("connectMonobank", () => {
  it("rejects an empty token without calling Monobank", async () => {
    const result = await connectMonobank({ error: null }, new FormData());
    expect(result.error).toMatch(/введи свій особистий токен/i);
  });

  it("creates a connection, stores the token in Vault, and backfills fixture transactions", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "unused-fixture-password-12345!",
      email_confirm: true,
    });
    expect(error).toBeNull();
    fixtureUserId = data.user!.id;

    const formData = new FormData();
    formData.set("token", "fixture-monobank-token");

    await expect(
      connectMonobank({ error: null }, formData),
    ).rejects.toThrow(RedirectSignal);

    const { data: connection } = await admin
      .from("monobank_connections")
      .select("*")
      .eq("user_id", fixtureUserId)
      .single();

    expect(connection).not.toBeNull();
    expect(connection!.monobank_account_id).toBe("acct-uah");
    expect(connection!.is_primary_currency).toBe(true);
    expect(connection!.other_jars).toEqual([{ id: "acct-usd", currency: "USD" }]);
    expect(connection!.connection_state).toBe("Connected");

    const { data: transactions } = await admin
      .from("transactions")
      .select("*")
      .eq("connection_id", connection!.id);

    expect(transactions).toHaveLength(1);
    expect(transactions![0].monobank_transaction_id).toBe("tx-fixture-1");
    expect(transactions![0].amount).toBe(-150); // -15000 minor units / 100
  });
});
