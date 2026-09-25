import type { Item, PriceTable, Vocabulary } from "@pantry/vocabulary";
import type { ManualPrice, } from "./manual";
import type { MapEntry, SeriesPoint } from "./map";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** StatCan titles carry stray spaces ("Brown rice, 900 grams "); compare without them. */
const sameTitle = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

export interface BuildInput {
  current: PriceTable;
  map: Record<string, MapEntry>;
  series: ReadonlyMap<number, SeriesPoint>;
  manual: readonly ManualPrice[];
  /** The new table's version: its publish date, later than the current one. */
  publishDate: string;
}

/**
 * The next price table. StatCan-mapped items take this month's national
 * figure (exact, or per kg × the pack's weight). Unmapped items take a
 * hand-entered price when the CSV has a complete row, and otherwise keep
 * their placeholder. Throws on anything that would quietly corrupt prices.
 */
export function buildTable({ current, map, series, manual, publishDate }: BuildInput): PriceTable {
  if (!(publishDate > current.version)) throw new Error(`publish date ${publishDate} must be later than the current table ${current.version}`);
  const ids = new Set(current.items.map((i) => i.id));
  for (const id of Object.keys(map)) if (!ids.has(id)) throw new Error(`statcan-map.json names '${id}', which isn't in the price table`);
  const byItem = new Map(manual.map((m) => [m.item_id, m]));
  for (const m of manual) {
    if (!ids.has(m.item_id)) throw new Error(`manual-prices.csv names '${m.item_id}', which isn't in the price table`);
    if (map[m.item_id]) throw new Error(`'${m.item_id}' has a StatCan price; take it out of manual-prices.csv`);
  }

  const items: Item[] = current.items.map((item) => {
    const entry = map[item.id];
    if (entry) {
      const point = series.get(entry.vector);
      if (!point) throw new Error(`no StatCan data for '${item.id}' (vector ${entry.vector})`);
      // The vector must still be this product, nationally; StatCan can reuse or retitle series.
      if (!sameTitle(point.title, `Canada;${entry.product}`)) throw new Error(`vector ${entry.vector} is now '${point.title}', not 'Canada;${entry.product}' (item '${item.id}')`);
      const price = entry.basis === "exact" ? point.value : point.value * entry.kg;
      return { ...item, price: round2(price), price_source: "statcan", updated: point.period.slice(0, 10) };
    }
    const hand = byItem.get(item.id);
    if (hand) return { ...item, price: hand.price, price_source: "manual", updated: hand.date };
    return { ...item, price_source: "placeholder", updated: null };
  });
  return { version: publishDate, items };
}

export interface Coverage {
  items: { statcan: number; manual: number; placeholder: number; total: number };
  groups: { real: number; mixed: number; placeholder: number; total: number };
  /** Groups with no real price at all: every card using one says "Sample prices". */
  placeholderGroups: string[];
  /** The same, for a halal user (meat groups narrowed to halal items). */
  placeholderGroupsHalal: string[];
}

export function coverage(v: Vocabulary): Coverage {
  const real = (i: Item) => i.price_source !== "placeholder";
  const count = (src: Item["price_source"]) => v.items.filter((i) => i.price_source === src).length;
  const groups = v.groupList().map((g) => g.group);
  const status = (g: string, halal: boolean) => {
    const items = v.itemsFor(g, { halal });
    return items.every(real) ? "real" : items.some(real) ? "mixed" : "placeholder";
  };
  const plain = groups.map((g) => [g, status(g, false)] as const);
  return {
    items: { statcan: count("statcan"), manual: count("manual"), placeholder: count("placeholder"), total: v.items.length },
    groups: {
      real: plain.filter(([, s]) => s === "real").length,
      mixed: plain.filter(([, s]) => s === "mixed").length,
      placeholder: plain.filter(([, s]) => s === "placeholder").length,
      total: groups.length,
    },
    placeholderGroups: plain.filter(([, s]) => s === "placeholder").map(([g]) => g),
    placeholderGroupsHalal: v.groupList({ halal: true }).map((g) => g.group).filter((g) => status(g, true) === "placeholder"),
  };
}
