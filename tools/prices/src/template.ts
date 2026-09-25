/** Re-ranks manual-prices.csv against the current price table, keeping what's been typed in. No network. */
import { vocabulary } from "@pantry/vocabulary";
import { PATHS, readManualFile, readStores, readTable, today, writeManualFile } from "./files";
import { manualRows } from "./rank";

const v = vocabulary.withTable(readTable());
const rows = manualRows(v, readManualFile(today(), new Set(readStores().map((s) => s.id))).rows);
writeManualFile(rows);
console.log(`Wrote ${PATHS.manual}: ${rows.length} rows in fill order`);
