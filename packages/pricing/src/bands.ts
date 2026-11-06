import type { CostBand, Province } from "@pantry/contract";
import { NO_DIET, type Diet, type Vocabulary } from "@pantry/vocabulary";
import { itemOptions } from "./price";

type Table = Pick<Vocabulary, "itemsFor" | "pricesFor" | "groupList" | "stores">;

/**
 * Each group's cost band (SPEC §7): its cheapest option under the diet on the
 * day, ranked against every other group's, and cut into thirds. The cut-offs
 * move with the monthly table, so nothing here is a fixed price. Groups with
 * no price are left out. Ties rank by group id, so the bands never shift
 * between runs on the same table.
 */
export function costBands(table: Table, on: string, diet: Diet = NO_DIET, province?: Province): Record<string, CostBand> {
  const priced = table
    .groupList(diet)
    .flatMap((g) => {
      const cheapest = itemOptions(table, g.group, on, diet, province)[0];
      return cheapest ? [{ group: g.group, cents: Math.round(cheapest.price * 100) }] : [];
    })
    .sort((a, b) => a.cents - b.cents || (a.group < b.group ? -1 : 1));
  const bands: Record<string, CostBand> = {};
  priced.forEach(({ group }, i) => {
    bands[group] = i < priced.length / 3 ? "low" : i < (2 * priced.length) / 3 ? "mid" : "high";
  });
  return bands;
}

/**
 * About how many things the budget buys (SPEC §7): the budget over the
 * median price of a low-band group's cheapest item, rounded down, at least 1.
 * A count, never dollars, so the engine can be told how much to buy without
 * seeing a price. `null` when nothing is priced.
 */
export function affordableItems(table: Table, budget: number, on: string, diet: Diet = NO_DIET, province?: Province): number | null {
  const bands = costBands(table, on, diet, province);
  const low = Object.entries(bands)
    .filter(([, b]) => b === "low")
    .map(([group]) => Math.round((itemOptions(table, group, on, diet, province)[0]?.price ?? 0) * 100))
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  if (!low.length) return null;
  const median = low[Math.floor(low.length / 2)]!;
  return Math.max(1, Math.floor((budget * 100) / median));
}
