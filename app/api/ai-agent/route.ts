import { NextResponse } from "next/server";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { answerQuestion, type ChatMessage } from "@/lib/ai/agent";

export async function POST(request: Request) {
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  const supabase = await createClient();

  try {
    const answer = await answerQuestion(supabase, question, body.history ?? []);
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json(
      { error: "the assistant couldn't answer that" },
      { status: 502 },
    );
  }
}
