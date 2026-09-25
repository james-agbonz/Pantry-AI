/**
 * Monthly price refresh (build step 7): `npm run prices:import [-- --dry-run] [-- --date YYYY-MM-DD]`.
 * Fetches StatCan table 18-10-0245-01 for the mapped items, merges the
 * hand-entered prices, writes the next price table, re-ranks the hand-entry
 * list, and prints coverage. Data only: no app code changes.
 */
import { vocabulary } from "@pantry/vocabulary";
import { buildTable } from "./build";
import { PATHS, readManualFile, readMap, readTable, today, writeManualFile, writeTable } from "./files";
import { manualRows } from "./rank";
import { report } from "./report";
import { fetchLatest } from "./statcan";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dateArg = args[args.indexOf("--date") + 1];
const publishDate = args.includes("--date") && dateArg ? dateArg : today();

const current = readTable();
const map = readMap();
const manual = readManualFile(publishDate);

console.log(report(vocabulary.withTable(current), "Before"));
const vectors = Object.values(map.items).map((e) => e.vector);
console.log(`\nFetching ${new Set(vectors).size} StatCan series for ${Object.keys(map.items).length} items…`);
const series = await fetchLatest(vectors);
const months = [...new Set([...series.values()].map((s) => s.period.slice(0, 7)))].sort();
console.log(`StatCan month: ${months.join(", ")}`);

const next = buildTable({ current, map: map.items, series, manual: manual.prices, publishDate });
const nextVocab = vocabulary.withTable(next); // Throws if the table doesn't fit the groups.
console.log(`\n${report(nextVocab, dryRun ? "After (dry run, nothing written)" : "After")}`);

const rows = manualRows(nextVocab, manual.rows);
if (!dryRun) {
  writeTable(next);
  writeManualFile(rows);
  console.log(`\nWrote ${PATHS.table}\nWrote ${PATHS.manual} (${rows.length} rows, in fill order)`);
}
