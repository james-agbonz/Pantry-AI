import type { Price } from "@pantry/vocabulary";
import type { ManualPrice } from "../manual";
import type { PriceSourceAdapter } from "./adapter";

/** Hand-entered prices from manual-prices.csv, each at its store, with a sale when one was recorded. */
export function manualRecords(rows: readonly ManualPrice[]): Price[] {
  return rows.map((r) => ({
    item: r.item_id,
    store: r.store,
    regular: r.price,
    sale: r.sale,
    source: "manual",
    updated: r.date,
  }));
}

export function manualSource(rows: readonly ManualPrice[]): PriceSourceAdapter {
  return { id: "manual", load: async () => manualRecords(rows) };
}
