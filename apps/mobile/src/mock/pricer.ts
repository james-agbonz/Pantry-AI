import type { Card, Pricing } from "@pantry/contract";
import { vocabulary, type Diet } from "@pantry/vocabulary";
import type { ItemOption, Pricer } from "@/data/sources";
import { PLACEHOLDER_PRICES } from "./prices";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Stand-in for the step 6 pricing module, on placeholder prices. Items in a
 * group are priced up from the group's placeholder so swaps change the total.
 * Follows SPEC §9's order: every needed item, then completes while they fit.
 */
export function mockPricer(diet: Diet): Pricer {
  const options = (group: string): ItemOption[] => {
    const base = PLACEHOLDER_PRICES[group] ?? 3.0;
    return vocabulary
      .itemsFor(group, diet)
      .map((item, i) => ({ id: item.id, name: item.name, unit: item.unit, price: round(base * (1 + 0.22 * i)) }))
      .sort((a, b) => a.price - b.price);
  };

  const price = (card: Card, budget: number, choices: Readonly<Record<string, string>> = {}): Pricing => {
    const line = (group: string) => {
      const opts = options(group);
      const pick = opts.find((o) => o.id === choices[group]) ?? opts[0];
      return { group, item: pick?.name ?? group, unit: pick?.unit ?? "1", price: pick?.price ?? 3.0 };
    };
    // The same group twice on a card is bought once (SPEC §9 step 3).
    const seen = new Set<string>();
    const missing = card.missing.filter((m) => !seen.has(m.group) && seen.add(m.group));

    const buy: Pricing["buy"] = missing.filter((m) => m.role === "needed").map((m) => ({ ...line(m.group), role: "needed" }));
    let total = buy.reduce((s, b) => s + b.price, 0);
    const to_complete: Pricing["to_complete"] = [];
    for (const m of missing.filter((x) => x.role === "completes")) {
      const l = line(m.group);
      if (total + l.price <= budget) {
        buy.push({ ...l, role: "completes" });
        total += l.price;
      } else to_complete.push(l);
    }
    return {
      buy,
      to_complete,
      total: round(total),
      budget,
      over_by: round(Math.max(0, total - budget)),
      complete_cost: round(to_complete.reduce((s, t) => s + t.price, 0)),
    };
  };

  return { options, price };
}
