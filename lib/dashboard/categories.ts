// Mirrors the Ukrainian category names produced by the `mcc_to_category()`
// Postgres function (supabase/migrations/20260719120000_ukrainian_category_names.sql).
// Display-only metadata (emoji + chart color) — unmapped/future categories
// fall back to a neutral gray dot rather than breaking the chart.
export const CATEGORY_STYLE: Record<string, { emoji: string; color: string }> = {
  "Продукти": { emoji: "🛒", color: "#22c55e" },
  "Ресторани та кафе": { emoji: "☕", color: "#f97316" },
  "Транспорт": { emoji: "🚌", color: "#3b82f6" },
  "Пальне": { emoji: "⛽", color: "#f59e0b" },
  "Покупки": { emoji: "🛍️", color: "#a855f7" },
  "Комунальні послуги": { emoji: "💡", color: "#06b6d4" },
  "Розваги": { emoji: "🎬", color: "#ec4899" },
  "Здоров'я": { emoji: "⚕️", color: "#ef4444" },
  "Інше": { emoji: "📦", color: "#9ca3af" },
};

const FALLBACK_STYLE = { emoji: "📦", color: "#9ca3af" };

export function categoryStyle(category: string): { emoji: string; color: string } {
  return CATEGORY_STYLE[category] ?? FALLBACK_STYLE;
}
