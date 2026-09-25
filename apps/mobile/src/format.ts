/** Every estimate carries `~` (DESIGN.md › Content). */

export function money(n: number): string {
  return `~$${n.toFixed(2)}`;
}

/** Whole number with thousands separators: 2345 → "2,345". */
export const whole = (n: number) => Math.round(n).toLocaleString("en-CA");

export const kcal = (n: number) => `~${whole(n)} kcal`;
export const protein = (n: number) => `~${whole(n)} g protein`;
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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-05" → "Oct 5". */
export function shortDate(yyyyMmDd: string): string {
  const [, m, d] = yyyyMmDd.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]!.slice(0, 3)} ${d}`;
}

/**
 * Where a line's price is from, for the meal screen and shopping list: the
 * store's name unless it's a national typical price, and the sale while one
 * runs. Empty when there's nothing to say.
 */
export function storeNote(line: { store: string; sale_ends: string | null }, store: { name(id: string): string; isAverage(id: string): boolean }): string {
  const parts = [store.isAverage(line.store) ? null : store.name(line.store), line.sale_ends ? `on sale until ${shortDate(line.sale_ends)}` : null];
  return parts.filter(Boolean).join(", ");
}

/** "2026-07" → "July 2026". */
export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/**
 * The once-per-money-screen line (SPEC §9). Invented numbers are never
 * called typical: while any price is a placeholder, it says so. Real prices
 * say which month they're from, since StatCan runs a couple of months behind.
 */
export function priceNote(placeholder: boolean, asOf: string | null = null): string {
  if (placeholder) return "Sample prices for testing, not real.";
  return asOf ? `Typical prices, ${monthLabel(asOf)}.` : "Typical prices.";
}

/** The note for several cards: sample if any is, else dated by the oldest. */
export function deckPriceNote(pricings: readonly { placeholder: boolean; as_of: string | null }[]): string {
  if (pricings.some((p) => p.placeholder)) return priceNote(true);
  const months = pricings.map((p) => p.as_of).filter((m): m is string => m !== null).sort();
  return priceNote(false, months[0] ?? null);
}
