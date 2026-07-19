"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getClientInfo,
  getStatement,
  setWebHook,
  currencyCodeToAlpha,
  MonobankApiError,
} from "@/lib/monobank/client";
import { generateWebhookSecretPath } from "@/lib/monobank/webhook-secret";

export type ReconnectFormState = { error: string | null };

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

function webhookUrlFor(secretPath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/monobank-webhook/${secretPath}`;
}

export async function reconnectMonobank(
  _prevState: ReconnectFormState,
  formData: FormData,
): Promise<ReconnectFormState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { error: "Введи свій особистий токен Monobank." };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  if (authError || !authData) {
    return { error: "Сесія закінчилась. Увійди знову." };
  }
  const userId = authData.claims.sub as string;

  const { data: connection, error: fetchError } = await supabase
    .from("monobank_connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (fetchError || !connection) {
    return { error: "Не знайдено підключення для перепідключення." };
  }

  try {
    await getClientInfo(token);
  } catch (err) {
    if (err instanceof MonobankApiError && err.status === 403) {
      return { error: "Monobank відхилив цей токен. Перевір і спробуй ще раз." };
    }
    return { error: "Не вдалося зв'язатися з Monobank. Спробуй трохи пізніше." };
  }

  const admin = createAdminClient();
  const { data: secretId, error: secretError } = await admin.rpc(
    "store_monobank_token",
    { p_token: token },
  );
  if (secretError || !secretId) {
    return { error: "Не вдалося безпечно зберегти токен. Спробуй ще раз." };
  }

  const newWebhookSecretPath = generateWebhookSecretPath();

  // The connection was broken since state_changed_at; if that's more than
  // 31 days ago, Monobank's history window can't recover the gap in
  // between — record it so U7 can show an explicit notice instead of
  // presenting the backfill as complete.
  const brokenSince = new Date(connection.state_changed_at).getTime();
  const outageMs = Date.now() - brokenSince;
  const historyGap =
    outageMs > THIRTY_ONE_DAYS_MS
      ? {
          history_gap_start: connection.state_changed_at,
          history_gap_end: new Date().toISOString(),
        }
      : { history_gap_start: null, history_gap_end: null };

  const { error: updateError } = await supabase
    .from("monobank_connections")
    .update({
      token_secret_id: secretId,
      webhook_secret_path: newWebhookSecretPath,
      connection_state: "Backfilling",
      ...historyGap,
    })
    .eq("id", connection.id);

  if (updateError) {
    return { error: "Не вдалося оновити підключення. Спробуй ще раз." };
  }

  try {
    await setWebHook(token, webhookUrlFor(newWebhookSecretPath));
  } catch {
    // Non-fatal — the next health-check cycle will catch a still-broken
    // webhook and flip back to NeedsReconnect.
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - 31 * 24 * 60 * 60;
  try {
    const items = await getStatement(token, connection.monobank_account_id, from, now);
    for (const item of items) {
      await admin.rpc("ingest_transaction", {
        p_webhook_secret_path: newWebhookSecretPath,
        p_monobank_transaction_id: item.id,
        p_amount: item.amount / 100,
        p_currency: currencyCodeToAlpha(item.currencyCode),
        p_mcc: item.mcc,
        p_description: item.description,
        p_occurred_at: new Date(item.time * 1000).toISOString(),
      });
    }
  } catch {
    // Connection and webhook are already live; a failed gap-fill backfill
    // isn't fatal to reconnecting itself.
  }

  await admin.rpc("process_aggregation_queue");

  await supabase
    .from("monobank_connections")
    .update({ connection_state: "Connected" })
    .eq("id", connection.id);

  redirect("/dashboard");
}
