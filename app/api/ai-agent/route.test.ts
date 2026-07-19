import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let fixtureUserId = "";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return createAdminClient();
  },
  getVerifiedUser: async () => (fixtureUserId ? { sub: fixtureUserId } : null),
}));

let answerQuestionImpl: () => Promise<string> = async () => "fixture answer";
vi.mock("@/lib/ai/agent", () => ({
  answerQuestion: (...args: unknown[]) => answerQuestionImplWrapper(...args),
}));
function answerQuestionImplWrapper(..._args: unknown[]) {
  return answerQuestionImpl();
}

const { POST } = await import("./route");

const admin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const suffix = Date.now();

function request(question: string) {
  return new Request("http://localhost/api/ai-agent", {
    method: "POST",
    body: JSON.stringify({ question, history: [] }),
  });
}

async function quotaRow() {
  const { data } = await admin
    .from("ai_quota_usage")
    .select("*")
    .eq("user_id", fixtureUserId)
    .maybeSingle();
  return data;
}

beforeEach(() => {
  answerQuestionImpl = async () => "fixture answer";
});

afterAll(async () => {
  if (fixtureUserId) await admin.auth.admin.deleteUser(fixtureUserId);
});

describe("POST /api/ai-agent", () => {
  it("returns 401 when there's no authenticated user", async () => {
    fixtureUserId = "";
    const response = await POST(request("anything"));
    expect(response.status).toBe(401);
  });

  it("completes quota (not reserved) on a successful answer", async () => {
    const { data } = await admin.auth.admin.createUser({
      email: `route-test-${suffix}@example.com`,
      password: "unused-fixture-password-12345!",
      email_confirm: true,
    });
    fixtureUserId = data.user!.id;

    const response = await POST(request("what did I spend?"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answer).toBe("fixture answer");

    const row = await quotaRow();
    expect(row!.reserved_count).toBe(1);
    expect(row!.completed_count).toBe(1);
  });

  it("releases the reservation (doesn't leave it counted) when the agent throws", async () => {
    answerQuestionImpl = async () => {
      throw new Error("boom");
    };

    const before = await quotaRow();
    const response = await POST(request("this will fail"));
    expect(response.status).toBe(502);

    const after = await quotaRow();
    expect(after!.reserved_count).toBe(before!.reserved_count);
    expect(after!.completed_count).toBe(before!.completed_count);
  });

  it("returns 429 quota_exceeded once the daily limit is hit, without calling the agent", async () => {
    const freshUser = (
      await admin.auth.admin.createUser({
        email: `route-quota-test-${suffix}@example.com`,
        password: "unused-fixture-password-12345!",
        email_confirm: true,
      })
    ).data.user!.id;
    fixtureUserId = freshUser;

    const originalEnv = process.env.FREE_TIER_DAILY_AI_QUOTA;
    process.env.FREE_TIER_DAILY_AI_QUOTA = "1";

    await POST(request("first question, within quota"));

    let agentCalled = false;
    answerQuestionImpl = async () => {
      agentCalled = true;
      return "should not be reached";
    };

    const response = await POST(request("second question, over quota"));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("quota_exceeded");
    expect(agentCalled).toBe(false);

    process.env.FREE_TIER_DAILY_AI_QUOTA = originalEnv;
    await admin.auth.admin.deleteUser(freshUser);
  });
});
