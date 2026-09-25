/**
 * Monthly price refresh: `npm run prices:import [-- --dry-run] [-- --date YYYY-MM-DD]`.
 * Runs each price source named in PRICE_SOURCES (default "statcan,manual"),
 * merges their prices into the next table, re-ranks the hand-entry list, and
 * prints coverage. Data only: no app code changes.
 */
import { vocabulary } from "@pantry/vocabulary";
import type { Price } from "@pantry/vocabulary";
import { buildTable } from "./build";
import { PATHS, readManualFile, readMap, readStores, readTable, today, writeManualFile, writeTable } from "./files";
import { manualRows } from "./rank";
import { report } from "./report";
import type { PriceSourceAdapter } from "./sources/adapter";
import { manualSource } from "./sources/manual";
import { statcanSource } from "./sources/statcan";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dateArg = args[args.indexOf("--date") + 1];
const publishDate = args.includes("--date") && dateArg ? dateArg : today();

const current = readTable();
const stores = readStores();
const manual = readManualFile(publishDate, new Set(stores.map((s) => s.id)));

// Price sources are adapters, picked from config like the model provider.
const available: Record<string, () => PriceSourceAdapter> = {
  statcan: () => statcanSource(readMap().items),
  manual: () => manualSource(manual.prices),
};
const wanted = (process.env.PRICE_SOURCES ?? "statcan,manual").split(",").map((s) => s.trim()).filter(Boolean);
const unknown = wanted.filter((w) => !available[w]);
if (unknown.length) throw new Error(`PRICE_SOURCES names unknown source(s): ${unknown.join(", ")}. Known: ${Object.keys(available).join(", ")}`);

console.log(report(vocabulary.withTable(current), "Before"));
const sources = new Map<string, Price[]>();
for (const id of wanted) {
  const records = await available[id]!().load({ current, on: publishDate });
  console.log(`\n${id}: ${records.length} prices`);
  sources.set(id, records);
}

const next = buildTable({ current, stores, sources, publishDate });
const nextVocab = vocabulary.withTable(next); // Throws if the table doesn't fit the groups.
console.log(`\n${report(nextVocab, dryRun ? "After (dry run, nothing written)" : "After")}`);

const rows = manualRows(nextVocab, manual.rows);
if (!dryRun) {
  writeTable(next);
  writeManualFile(rows);
  console.log(`\nWrote ${PATHS.table}\nWrote ${PATHS.manual} (${rows.length} rows, in fill order)`);
}
