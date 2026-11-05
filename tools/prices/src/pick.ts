/**
 * Copies the products marked with x in store-candidates.csv into
 * store-map.json: `npm run prices:pick`. One pick per item per store; the
 * picked rows leave the candidates file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { vocabulary } from "@pantry/vocabulary";
import { parseCsv, toCsv } from "./csv";
import { CANDIDATE_COLUMNS } from "./find";
import { PATHS, readStoreMap, writeStoreMap } from "./files";
import { STORES, type CollectorStore, type StoreMap } from "./stores";

/** Applies the picks to the map. Throws on two picks for one item, or an unknown store or item. */
export function applyPicks(map: StoreMap, rows: readonly string[][]): { map: StoreMap; rest: string[][]; picked: number } {
  const col = (name: (typeof CANDIDATE_COLUMNS)[number]) => CANDIDATE_COLUMNS.indexOf(name);
  const next: StoreMap = { ...map, stores: { walmart_ca: { ...map.stores.walmart_ca }, gianttiger_ca: { ...map.stores.gianttiger_ca } } };
  const items = new Set(vocabulary.items.map((i) => i.id));
  const seen = new Set<string>();
  const rest: string[][] = [];
  let picked = 0;
  for (const r of rows) {
    if (!r[col("pick")]?.trim()) {
      rest.push(r);
      continue;
    }
    const store = r[col("store")] as CollectorStore;
    const item = r[col("item_id")]!;
    if (!(store in STORES)) throw new Error(`unknown store '${store}'`);
    if (!items.has(item)) throw new Error(`unknown item '${item}'`);
    if (!r[col("ref")]) throw new Error(`${store} ${item}: the picked row has no product`);
    if (seen.has(`${store}:${item}`)) throw new Error(`${store} ${item}: picked twice; keep one x`);
    seen.add(`${store}:${item}`);
    next.stores[store][item] = { ref: r[col("ref")]!, product: r[col("product")]! };
    picked++;
  }
  // Rows for items just picked aren't candidates any more.
  return { map: next, rest: rest.filter((r) => !seen.has(`${r[col("store")]}:${r[col("item_id")]}`)), picked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = parseCsv(readFileSync(PATHS.candidates, "utf8")).slice(1);
  const { map, rest, picked } = applyPicks(readStoreMap(), rows);
  writeStoreMap(map);
  writeFileSync(PATHS.candidates, toCsv([[...CANDIDATE_COLUMNS], ...rest]));
  const count = (s: CollectorStore) => Object.keys(map.stores[s]).length;
  console.log(`Picked ${picked}. store-map.json now has Walmart ${count("walmart_ca")}, Giant Tiger ${count("gianttiger_ca")} of ${vocabulary.items.length} items.`);
}
