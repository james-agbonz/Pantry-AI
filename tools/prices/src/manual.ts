import { parseCsv, toCsv } from "./csv";

export const MANUAL_COLUMNS = [
  "rank", "item_id", "group", "name", "unit", "store", "price", "sale_price", "sale_ends", "source", "source_detail", "date", "why",
] as const;

/** A hand-entered price, with where and when it was seen, and a sale if there was one. */
export interface ManualPrice {
  item_id: string;
  /** A store id from stores.json. */
  store: string;
  /** The regular price. */
  price: number;
  sale: { price: number; ends: string } | null;
  source: string;
  source_detail: string;
  date: string;
}

export type ManualRow = Record<(typeof MANUAL_COLUMNS)[number], string>;

/**
 * Reads manual-prices.csv. A row counts only when store, price, source and
 * date are all filled in; a row with some but not all is an error, so a
 * half-entered price never slips in without its record. Rows with none are
 * just not done. A sale needs both its price and its end date.
 */
export function readManual(
  text: string,
  today: string,
  stores: ReadonlySet<string> = new Set(),
): { rows: ManualRow[]; prices: ManualPrice[]; errors: string[] } {
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
    const required = ["store", "price", "source", "date"] as const;
    const filled = required.filter((k) => r[k]).length + (r.sale_price ? 1 : 0) + (r.sale_ends ? 1 : 0);
    if (filled === 0) return;
    const missing = required.filter((k) => !r[k]);
    if (missing.length) {
      errors.push(`line ${line} (${r.item_id}): missing ${missing.join(", ")}`);
      return;
    }
    if (stores.size && !stores.has(r.store)) {
      errors.push(`line ${line} (${r.item_id}): unknown store '${r.store}'; add it to stores.json first`);
      return;
    }
    const price = Number(r.price.replace(/^\$/, ""));
    if (!/^\$?\d+(\.\d{1,2})?$/.test(r.price) || !(price > 0) || price > 500) errors.push(`line ${line} (${r.item_id}): price '${r.price}' should be dollars like 3.49`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) errors.push(`line ${line} (${r.item_id}): date '${r.date}' should be YYYY-MM-DD`);
    else if (r.date > today) errors.push(`line ${line} (${r.item_id}): date ${r.date} is in the future`);
    else {
      let sale: ManualPrice["sale"] = null;
      if (r.sale_price || r.sale_ends) {
        const salePrice = Number(r.sale_price.replace(/^\$/, ""));
        if (!r.sale_price || !r.sale_ends) return void errors.push(`line ${line} (${r.item_id}): a sale needs both sale_price and sale_ends`);
        if (!/^\$?\d+(\.\d{1,2})?$/.test(r.sale_price) || !(salePrice < price)) return void errors.push(`line ${line} (${r.item_id}): sale_price '${r.sale_price}' should be below the regular price`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.sale_ends) || r.sale_ends < r.date) return void errors.push(`line ${line} (${r.item_id}): sale_ends '${r.sale_ends}' should be a YYYY-MM-DD on or after the date seen`);
        sale = { price: salePrice, ends: r.sale_ends };
      }
      prices.push({ item_id: r.item_id, store: r.store, price, sale, source: r.source, source_detail: r.source_detail, date: r.date });
    }
  });
  return { rows, prices, errors };
}

export function writeManual(rows: readonly ManualRow[]): string {
  return toCsv([MANUAL_COLUMNS, ...rows.map((r) => MANUAL_COLUMNS.map((c) => r[c]))]);
}
