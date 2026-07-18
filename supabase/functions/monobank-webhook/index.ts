// Receives Monobank's personal-API webhook (a StatementItem event) and
// persists it via ingest_transaction — the sole write path into
// `transactions`. Monobank's personal webhook has no signature to verify,
// so this handler treats every payload as an untrusted trigger: the
// per-user secret embedded in the URL path is the only authentication,
// validated inside ingest_transaction itself (never logged).
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const ISO_4217_NUMERIC_TO_ALPHA: Record<number, string> = {
  980: "UAH",
  840: "USD",
  978: "EUR",
  826: "GBP",
  985: "PLN",
};

function currencyCodeToAlpha(numericCode: number): string {
  return ISO_4217_NUMERIC_TO_ALPHA[numericCode] ?? String(numericCode);
}

type MonobankStatementItem = {
  id: string;
  time: number;
  description?: string;
  mcc?: number;
  amount: number;
  currencyCode: number;
};

type MonobankWebhookPayload = {
  type?: string;
  data?: { account?: string; statementItem?: MonobankStatementItem };
};

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const secret = segments[segments.length - 1] ?? "";

    let payload: MonobankWebhookPayload;
    try {
      payload = await req.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const item = payload.data?.statementItem;
    if (!secret || !item?.id) {
      return new Response("bad request", { status: 400 });
    }

    const { error } = await ctx.supabaseAdmin.rpc("ingest_transaction", {
      p_webhook_secret_path: secret,
      p_monobank_transaction_id: String(item.id),
      p_amount: Number(item.amount) / 100,
      p_currency: currencyCodeToAlpha(Number(item.currencyCode)),
      p_mcc: item.mcc ?? null,
      p_description: item.description ?? null,
      p_occurred_at: new Date(Number(item.time) * 1000).toISOString(),
    });

    if (error) {
      // Covers both an invalid/unknown secret and a genuine DB error —
      // the response never distinguishes which, and never echoes `secret`.
      return new Response("rejected", { status: 401 });
    }

    return new Response("ok", { status: 200 });
  }),
};
