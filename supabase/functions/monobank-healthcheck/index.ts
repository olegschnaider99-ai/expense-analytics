// Triggered hourly by pg_cron/pg_net (see the healthcheck_cron migration).
// For each active connection, decrypts the Monobank token via the
// SECURITY DEFINER decrypt function, calls Monobank's client-info, and
// flips connection_state on failure or on a webhook registration that no
// longer matches this connection's expected secret path (R12's "disabled
// webhook" case — a plain client-info success would otherwise miss it).
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const INTERNAL_SECRET = Deno.env.get("MONOBANK_HEALTHCHECK_SECRET") ?? "";

type Connection = {
  id: string;
  connection_state: string;
  webhook_secret_path: string;
};

function expectedWebhookUrl(secretPath: string): string {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  return `${projectUrl}/functions/v1/monobank-webhook/${secretPath}`;
}

// deno-lint-ignore no-explicit-any
async function isConnectionHealthy(supabaseAdmin: any, connection: Connection) {
  const { data: token, error: decryptError } = await supabaseAdmin.rpc(
    "decrypt_monobank_token",
    { p_connection_id: connection.id, p_source: "healthcheck" },
  );
  if (decryptError || !token) return false;

  try {
    const response = await fetch("https://api.monobank.ua/personal/client-info", {
      headers: { "X-Token": token },
    });
    if (!response.ok) return false;

    const info = await response.json();
    const expected = expectedWebhookUrl(connection.webhook_secret_path);
    return info.webHookUrl === expected;
  } catch {
    return false;
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const provided = req.headers.get("x-internal-secret") ?? "";
    if (!INTERNAL_SECRET || provided !== INTERNAL_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const { data: connections, error: listError } = await ctx.supabaseAdmin
      .from("monobank_connections")
      .select("id, connection_state, webhook_secret_path")
      .in("connection_state", ["Connected", "Degraded"]);

    if (listError) {
      return new Response("failed to list connections", { status: 500 });
    }

    let checked = 0;
    let degraded = 0;
    let needsReconnect = 0;

    for (const connection of (connections ?? []) as Connection[]) {
      checked += 1;
      const healthy = await isConnectionHealthy(ctx.supabaseAdmin, connection);

      if (healthy) {
        if (connection.connection_state !== "Connected") {
          await ctx.supabaseAdmin
            .from("monobank_connections")
            .update({ connection_state: "Connected" })
            .eq("id", connection.id);
        }
        continue;
      }

      const nextState =
        connection.connection_state === "Degraded" ? "NeedsReconnect" : "Degraded";
      if (nextState === "NeedsReconnect") needsReconnect += 1;
      else degraded += 1;

      await ctx.supabaseAdmin
        .from("monobank_connections")
        .update({ connection_state: nextState })
        .eq("id", connection.id);
    }

    return Response.json({ checked, degraded, needsReconnect });
  }),
};
