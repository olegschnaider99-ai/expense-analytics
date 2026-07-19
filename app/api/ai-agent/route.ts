import { NextResponse } from "next/server";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerQuestion, type ChatMessage } from "@/lib/ai/agent";

export async function POST(request: Request) {
  const dailyQuota = Number(process.env.FREE_TIER_DAILY_AI_QUOTA ?? 20);
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = user.sub as string;

  let body: { question?: string; history?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // TODO: premium users bypass this cap once WayForPay billing exists.
  const { data: reserved, error: reserveError } = await admin.rpc("reserve_ai_quota", {
    p_user_id: userId,
    p_daily_limit: dailyQuota,
  });
  if (reserveError) {
    return NextResponse.json(
      { error: "the assistant couldn't answer that" },
      { status: 502 },
    );
  }
  if (!reserved) {
    return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
  }

  const supabase = await createClient();

  try {
    const answer = await answerQuestion(supabase, question, body.history ?? []);
    await admin.rpc("complete_ai_quota", { p_user_id: userId });
    return NextResponse.json({ answer });
  } catch {
    await admin.rpc("release_ai_quota", { p_user_id: userId });
    return NextResponse.json(
      { error: "the assistant couldn't answer that" },
      { status: 502 },
    );
  }
}
