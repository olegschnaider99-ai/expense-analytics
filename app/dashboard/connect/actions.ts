"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getClientInfo,
  getStatement,
  setWebHook,
  selectPrimaryAccount,
  currencyCodeToAlpha,
  MonobankApiError,
} from "@/lib/monobank/client";
import { generateWebhookSecretPath } from "@/lib/monobank/webhook-secret";

export type ConnectFormState = { error: string | null };

const THIRTY_ONE_DAYS_SECONDS = 31 * 24 * 60 * 60;

function webhookUrlFor(secretPath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/monobank-webhook/${secretPath}`;
}

export async function connectMonobank(
  _prevState: ConnectFormState,
  formData: FormData,
): Promise<ConnectFormState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { error: "Enter your Monobank personal token." };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  if (authError || !authData) {
    return { error: "Your session expired. Log in again." };
  }
  const userId = authData.claims.sub as string;

  let clientInfo;
  try {
    clientInfo = await getClientInfo(token);
  } catch (err) {
    if (err instanceof MonobankApiError && err.status === 403) {
      return { error: "That token was rejected by Monobank. Check it and try again." };
    }
    return { error: "Couldn't reach Monobank. Try again in a moment." };
  }

  const { primary, isPrimaryCurrency } = selectPrimaryAccount(clientInfo.accounts);
  const otherJars = clientInfo.accounts
    .filter((account) => account.id !== primary.id)
    .map((account) => ({
      id: account.id,
      currency: currencyCodeToAlpha(account.currencyCode),
    }));

  const admin = createAdminClient();
  const { data: secretId, error: secretError } = await admin.rpc(
    "store_monobank_token",
    { p_token: token },
  );
  if (secretError || !secretId) {
    return { error: "Couldn't securely store your token. Try again." };
  }

  const webhookSecretPath = generateWebhookSecretPath();

  const { data: connection, error: insertError } = await supabase
    .from("monobank_connections")
    .insert({
      user_id: userId,
      monobank_account_id: primary.id,
      is_primary_currency: isPrimaryCurrency,
      token_secret_id: secretId,
      webhook_secret_path: webhookSecretPath,
      other_jars: otherJars,
      connection_state: "Backfilling",
    })
    .select()
    .single();

  if (insertError || !connection) {
    return { error: "Couldn't save the connection. Try again." };
  }

  try {
    await setWebHook(token, webhookUrlFor(webhookSecretPath));
  } catch {
    // Non-fatal for the connect flow itself — surfaced via U5's health-check,
    // which will find the connection stuck without a live webhook and flip
    // it to NeedsReconnect rather than leaving it silently broken.
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - THIRTY_ONE_DAYS_SECONDS;
  try {
    const items = await getStatement(token, primary.id, from, now);
    for (const item of items) {
      await admin.rpc("ingest_transaction", {
        p_webhook_secret_path: webhookSecretPath,
        p_monobank_transaction_id: item.id,
        p_amount: item.amount / 100,
        p_currency: currencyCodeToAlpha(item.currencyCode),
        p_mcc: item.mcc,
        p_description: item.description,
        p_occurred_at: new Date(item.time * 1000).toISOString(),
      });
    }
  } catch {
    // The connection and webhook are already live; a failed backfill just
    // means the dashboard starts sparser than it could. Not fatal here.
  }

  await supabase
    .from("monobank_connections")
    .update({ connection_state: "Connected" })
    .eq("id", connection.id);

  redirect("/dashboard");
}
