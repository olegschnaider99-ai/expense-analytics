import { randomBytes } from "node:crypto";

/**
 * Generates the per-user secret embedded in the webhook URL path. This is
 * the substitute for signature verification — Monobank's personal webhook
 * has no signing mechanism — so it must be unguessable: 32 bytes (256 bits)
 * of CSPRNG output, well above the ≥128-bit floor, hex-encoded so it's
 * URL-safe without escaping.
 */
export function generateWebhookSecretPath(): string {
  return randomBytes(32).toString("hex");
}
