import { parseCsv, toCsv } from "./csv";

export const MANUAL_COLUMNS = ["rank", "item_id", "group", "name", "unit", "price", "source", "source_detail", "date", "why"] as const;

/** A hand-entered price, with where and when it was seen. */
export interface ManualPrice {
  item_id: string;
  price: number;
  source: string;
  source_detail: string;
  date: string;
}

export type ManualRow = Record<(typeof MANUAL_COLUMNS)[number], string>;

/**
 * Reads manual-prices.csv. A row counts only when price, source and date are
 * all filled in; a row with some but not all is an error, so a half-entered
 * price never slips in without its record. Rows with none are just not done.
 */
export function readManual(text: string, today: string): { rows: ManualRow[]; prices: ManualPrice[]; errors: string[] } {
  const [header, ...body] = parseCsv(text);
  const errors: string[] = [];
  if (!header || MANUAL_COLUMNS.some((c, i) => header[i]?.trim() !== c)) {
    return { rows: [], prices: [], errors: [`header must be: ${MANUAL_COLUMNS.join(",")}`] };
  }
  const rows = body.map((cells) => Object.fromEntries(MANUAL_COLUMNS.map((c, i) => [c, (cells[i] ?? "").trim()])) as ManualRow);
  const prices: ManualPrice[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const line = i + 2;
    if (seen.has(r.item_id)) errors.push(`line ${line}: '${r.item_id}' appears twice`);
    seen.add(r.item_id);
    const filled = [r.price, r.source, r.date].filter(Boolean).length;
    if (filled === 0) return;
    if (filled < 3) {
      const missing = (["price", "source", "date"] as const).filter((k) => !r[k]);
      errors.push(`line ${line} (${r.item_id}): missing ${missing.join(", ")}`);
      return;
    }
    const price = Number(r.price.replace(/^\$/, ""));
    if (!/^\$?\d+(\.\d{1,2})?$/.test(r.price) || !(price > 0) || price > 500) errors.push(`line ${line} (${r.item_id}): price '${r.price}' should be dollars like 3.49`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) errors.push(`line ${line} (${r.item_id}): date '${r.date}' should be YYYY-MM-DD`);
    else if (r.date > today) errors.push(`line ${line} (${r.item_id}): date ${r.date} is in the future`);
    else prices.push({ item_id: r.item_id, price, source: r.source, source_detail: r.source_detail, date: r.date });
  });
  return { rows, prices, errors };
}

export function writeManual(rows: readonly ManualRow[]): string {
  return toCsv([MANUAL_COLUMNS, ...rows.map((r) => MANUAL_COLUMNS.map((c) => r[c]))]);
}
