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
