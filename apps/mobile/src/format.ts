/** Every estimate carries `~` (DESIGN.md › Content). */

export function money(n: number): string {
  return `~$${n.toFixed(2)}`;
}

export const kcal = (n: number) => `~${Math.round(n)} kcal`;
export const protein = (n: number) => `~${Math.round(n)} g protein`;
export const minutes = (n: number) => `${Math.round(n)} min`;

/**
 * A budget as typed: "15", "$15", "15.50", "15,50". Positive and at most
 * $1000; anything else is `null`, and "Deal me meals" stays disabled.
 */
export function parseBudget(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 1000 ? n : null;
}
