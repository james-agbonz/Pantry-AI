import type { Card, Pricing } from "@pantry/contract";
import { money } from "@/format";

/**
 * The plain-text list to take to the store (SPEC §12). Every figure keeps its
 * `~`, and the list says once that prices are typical, not quotes.
 */
export function shoppingList(card: Card, p: Pricing): string {
  const line = (l: { item: string; unit: string; price: number }) => `- ${l.item}, ${l.unit}: ${money(l.price)}`;
  const out = [card.name, "", `Buy (${money(p.total)} of $${p.budget}):`, ...p.buy.map(line)];
  if (p.over_by > 0) out.push(`Over by ${money(p.over_by)}`);
  if (p.to_complete.length) out.push("", `To complete (+${money(p.complete_cost)}):`, ...p.to_complete.map(line));
  out.push("", "Prices are typical, not quotes.");
  return out.join("\n");
}
