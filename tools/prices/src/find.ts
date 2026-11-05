/**
 * Proposes store products for items not yet in store-map.json:
 * `npm run prices:find -- --store walmart_ca|gianttiger_ca [--limit N]`.
 * Writes store-candidates.csv; mark the right product with x in `pick`, then
 * `npm run prices:pick`. Nothing is priced from a candidate until a person picks it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { vocabulary, type Item } from "@pantry/vocabulary";
import { parseCsv, toCsv } from "./csv";
import { PATHS, readStoreMap } from "./files";
import { giantTigerSearch, STORES, walmartBrowseItems, type CollectorStore } from "./stores";
import { politeClient, type PoliteClient } from "./web";

export const CANDIDATE_COLUMNS = ["store", "item_id", "item", "unit", "pick", "size_match", "score", "product", "price", "ref"] as const;

/** Grams, millilitres or a count from a size like "2kg", "540 mL", "10 pack", "1 bulb". */
export function sizeOf(text: string): { amount: number; kind: "g" | "ml" | "count" } | null {
  const t = text.toLowerCase().replace(/,/g, ".");
  const m = /(\d+(?:\.\d+)?)[\s-]*(kg|g|ml|l|lb|pack|pk|ct|count|x)\b/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case "kg":
      return { amount: n * 1000, kind: "g" };
    case "g":
      return { amount: n, kind: "g" };
    case "lb":
      return { amount: Math.round(n * 453.6), kind: "g" };
    case "l":
      return { amount: n * 1000, kind: "ml" };
    case "ml":
      return { amount: n, kind: "ml" };
    default:
      return { amount: n, kind: "count" };
  }
}

/** Same size within 3% (stores round: 946 mL vs 950 mL, 2.2 kg vs 2 kg is not a match). */
export function sameSize(itemUnit: string, product: string): boolean {
  const a = sizeOf(itemUnit);
  const b = sizeOf(product);
  return !!a && !!b && a.kind === b.kind && Math.abs(a.amount - b.amount) / a.amount <= 0.03;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["and", "the", "with", "canned", "dry", "inch", "single"].includes(w));

/** Share of the item's words in the product name, 0–1. */
export function score(item: Pick<Item, "name">, product: string): number {
  const want = words(item.name);
  const have = new Set(words(product));
  return want.length ? want.filter((w) => have.has(w) || have.has(`${w}s`) || have.has(w.replace(/s$/, ""))).length / want.length : 0;
}

/** Walmart grocery aisles that hold our items. Snacks, drinks and household aisles are left out. */
const WALMART_AISLES = ["pantry-food", "frozen-food", "dairy-eggs", "meat-seafood-alternatives", "bread-bakery", "fruits-vegetables", "bulk-grocery-foods"];

/**
 * Walmart's products in our aisles, from its category pages (about 40 each,
 * as served without its app's scripts). Pages come from Walmart's sitemap;
 * its search is off limits in robots.txt, and further pages need its
 * internal app interface, which the collector doesn't use.
 */
async function walmartCatalogue(web: PoliteClient): Promise<{ name: string; price: number; ref: string }[]> {
  const index = await web.get(`${STORES.walmart_ca.origin}/sitemap-browse.xml`);
  const parts = [...index.matchAll(/<loc>([^<]+-en\d*\.xml\.gz)<\/loc>/g)].map((m) => m[1]!);
  const pages: string[] = [];
  for (const part of parts) {
    for (const m of (await web.get(part)).matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = m[1]!;
      if (!u.includes("?") && WALMART_AISLES.some((a) => u.includes(`/en/browse/grocery/${a}/`))) pages.push(u);
    }
  }
  console.log(`Reading ${pages.length} Walmart category pages…`);
  const byRef = new Map<string, { name: string; price: number; ref: string }>();
  for (const [n, page] of pages.entries()) {
    try {
      for (const c of walmartBrowseItems(await web.get(page))) byRef.set(c.ref, c);
    } catch (e) {
      console.log(`  ${page}: ${e instanceof Error ? e.message : e}`);
      if (/refused/.test(String(e))) break;
    }
    if ((n + 1) % 50 === 0) console.log(`  ${n + 1}/${pages.length} pages, ${byRef.size} products`);
  }
  return [...byRef.values()];
}

async function candidatesFor(store: CollectorStore, item: Item, web: PoliteClient, catalogue: { name: string; price: number; ref: string }[]): Promise<{ name: string; price: number; ref: string }[]> {
  if (store === "gianttiger_ca") return giantTigerSearch(web, `${item.name.replace(/,/g, "")} ${item.unit}`);
  return catalogue;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const store = args[args.indexOf("--store") + 1] as CollectorStore;
  if (!(store in STORES)) throw new Error(`--store must be one of: ${Object.keys(STORES).join(", ")}`);
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
  const mapped = readStoreMap().stores[store];
  const web = politeClient();
  console.log(`Collector identifies as: ${web.agent}`);
  const catalogue = store === "walmart_ca" ? await walmartCatalogue(web) : [];
  if (store === "walmart_ca") console.log(`Walmart catalogue: ${catalogue.length} products`);

  // Keep other stores' rows and anything already marked; replace this store's unmarked rows.
  const kept = existsSync(PATHS.candidates)
    ? parseCsv(readFileSync(PATHS.candidates, "utf8"))
        .slice(1)
        .filter((r) => r[0] !== store || r[4]?.trim())
    : [];
  const rows: string[][] = [...kept];
  const todo = vocabulary.items.filter((i) => !mapped[i.id]).slice(0, limit);
  for (const [n, item] of todo.entries()) {
    let found: { name: string; price: number; ref: string }[] = [];
    try {
      found = await candidatesFor(store, item, web, catalogue);
    } catch (e) {
      console.log(`  ${item.id}: ${e instanceof Error ? e.message : e}`);
      if (e instanceof Error && e.name === "Error" && /refused/.test(e.message)) break;
    }
    const ranked = found
      .map((c) => ({ ...c, size: sameSize(item.unit, c.name), s: score(item, c.name) }))
      .filter((c) => c.s > 0)
      .sort((a, b) => Number(b.size) - Number(a.size) || b.s - a.s || a.price - b.price)
      .slice(0, 4);
    for (const c of ranked) rows.push([store, item.id, item.name, item.unit, "", c.size ? "yes" : "no", c.s.toFixed(2), c.name, c.price.toFixed(2), c.ref]);
    if (!ranked.length) rows.push([store, item.id, item.name, item.unit, "", "", "", "(no candidate found)", "", ""]);
    console.log(`${n + 1}/${todo.length} ${item.id}: ${ranked.length} candidate(s)${ranked[0]?.size ? ", size match" : ""}`);
  }
  writeFileSync(PATHS.candidates, toCsv([[...CANDIDATE_COLUMNS], ...rows]));
  console.log(`Wrote ${PATHS.candidates}. Mark the right product with x in "pick", then npm run prices:pick.`);
}
