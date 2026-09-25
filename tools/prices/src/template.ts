/** Re-ranks manual-prices.csv against the current price table, keeping what's been typed in. No network. */
import { vocabulary } from "@pantry/vocabulary";
import { PATHS, readManualFile, readTable, today, writeManualFile } from "./files";
import { manualRows } from "./rank";

const v = vocabulary.withTable(readTable());
const rows = manualRows(v, readManualFile(today()).rows);
writeManualFile(rows);
console.log(`Wrote ${PATHS.manual}: ${rows.length} rows in fill order`);
