import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PriceTable, Store } from "@pantry/vocabulary";
import { z } from "zod";
import { readManual, writeManual, type ManualRow } from "./manual";
import { StatcanMap } from "./map";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const PATHS = {
  table: here("../../../packages/vocabulary/data/price-table.json"),
  map: here("../statcan-map.json"),
  manual: here("../manual-prices.csv"),
  stores: here("../stores.json"),
};

export const readStores = () => z.object({ stores: z.array(Store) }).parse(JSON.parse(readFileSync(PATHS.stores, "utf8"))).stores;

/** Local calendar date, YYYY-MM-DD. */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const readTable = () => PriceTable.parse(JSON.parse(readFileSync(PATHS.table, "utf8")));
export const readMap = () => StatcanMap.parse(JSON.parse(readFileSync(PATHS.map, "utf8")));

export function readManualFile(on: string, stores: ReadonlySet<string>): { rows: ManualRow[]; prices: ReturnType<typeof readManual>["prices"] } {
  if (!existsSync(PATHS.manual)) return { rows: [], prices: [] };
  const r = readManual(readFileSync(PATHS.manual, "utf8"), on, stores);
  if (r.errors.length) throw new Error(`manual-prices.csv:\n  ${r.errors.join("\n  ")}`);
  return r;
}

/** `{"id": "x", "price": 1}`: the file's existing spacing, so a refresh diff shows only what changed. */
const line = (o: object) => `{${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")}}`;

/** One record per line, like the file has always been, so monthly diffs stay readable. */
export function writeTable(t: PriceTable) {
  const list = (xs: readonly object[]) => xs.map((x) => `    ${line(x)}`).join(",\n");
  writeFileSync(
    PATHS.table,
    `{\n  "schema": ${t.schema},\n  "version": ${JSON.stringify(t.version)},\n  "stores": [\n${list(t.stores)}\n  ],\n  "items": [\n${list(t.items)}\n  ],\n  "prices": [\n${list(t.prices)}\n  ]\n}\n`,
  );
}

export const writeManualFile = (rows: readonly ManualRow[]) => writeFileSync(PATHS.manual, writeManual(rows));
