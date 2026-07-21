"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActivatePremiumResult = { ok: boolean; error?: string };

/**
 * Test-only toggle — flips the caller's own `user_settings.is_premium` row.
 * There's no payment step (WayForPay is deliberately out of scope for now);
 * this exists purely to demonstrate a premium-gated feature end to end.
 */
export async function activatePremium(): Promise<ActivatePremiumResult> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  if (authError || !authData) {
    return { ok: false, error: "Сесія закінчилась. Увійди знову." };
  }
  const userId = authData.claims.sub as string;

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, is_premium: true, updated_at: new Date().toISOString() });

  if (error) {
    return { ok: false, error: "Не вдалося активувати Premium. Спробуй ще раз." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
