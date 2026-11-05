import type { Price } from "@pantry/vocabulary";
import { SHELF, type CollectorStore, type Shelf, type StoreMapEntry } from "../stores";
import { Refused, type PoliteClient } from "../web";
import type { PriceSourceAdapter } from "./adapter";

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** How long a store sale is trusted for. Stores rarely show an end date; the weekly run checks again. */
export const SALE_TRUST_DAYS = 6;

/**
 * One shelf reading as a price record. On sale, `regular` is the was-price and the
 * sale runs to the next weekly run at most, so a sale the collector stops seeing
 * can't outlive it.
 */
export function shelfRecord(item: string, store: CollectorStore, shelf: Shelf, on: string): Price {
  return {
    item,
    store,
    regular: shelf.was ?? shelf.price,
    sale: shelf.was ? { price: shelf.price, ends: addDays(on, SALE_TRUST_DAYS) } : null,
    source: "store",
    updated: on,
  };
}

export interface StoreRun {
  records: Price[];
  /** Items not priced this run, and why. */
  missed: { item: string; why: string }[];
}

/** Reads every mapped item at one store. Stops at the store's first refusal; other failures skip the item. */
export async function collectStore(
  store: CollectorStore,
  entries: Readonly<Record<string, StoreMapEntry>>,
  web: PoliteClient,
  on: string,
  shelfFor = SHELF[store],
): Promise<StoreRun> {
  const records: Price[] = [];
  const missed: StoreRun["missed"] = [];
  let refusal: string | null = null;
  for (const [item, entry] of Object.entries(entries)) {
    if (refusal) {
      missed.push({ item, why: refusal });
      continue;
    }
    try {
      const shelf = await shelfFor(web, entry.ref);
      if (!shelf.inStock) missed.push({ item, why: "out of stock" });
      else records.push(shelfRecord(item, store, shelf, on));
    } catch (e) {
      if (e instanceof Refused) refusal = `store refused: ${e.why}`;
      missed.push({ item, why: e instanceof Refused ? refusal! : String(e instanceof Error ? e.message : e) });
    }
  }
  return { records, missed };
}

/** A store as a price source for `prices:import` (PRICE_SOURCES=walmart_ca,gianttiger_ca). */
export function storeSource(store: CollectorStore, entries: Readonly<Record<string, StoreMapEntry>>, web: PoliteClient, log = console.log): PriceSourceAdapter {
  return {
    id: store,
    async load({ on }) {
      const run = await collectStore(store, entries, web, on);
      for (const m of run.missed) log(`  ${store}: no price for ${m.item} (${m.why})`);
      return run.records;
    },
  };
}
