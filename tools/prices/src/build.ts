import type { Price, PriceTable, Store, Vocabulary } from "@pantry/vocabulary";

export interface BuildInput {
  current: PriceTable;
  stores: readonly Store[];
  /** Real prices from each source, by source id. */
  sources: ReadonlyMap<string, readonly Price[]>;
  /** The new table's version: its publish date, later than the current one. */
  publishDate: string;
}

/**
 * The next price table. Every real price from every source goes in; two for
 * the same item at the same store is refused, naming both sources. An item
 * with no real price keeps its placeholder from the current table. Throws on
 * anything that would quietly corrupt prices.
 */
export function buildTable({ current, stores, sources, publishDate }: BuildInput): PriceTable {
  if (!(publishDate > current.version)) throw new Error(`publish date ${publishDate} must be later than the current table ${current.version}`);
  const items = new Set(current.items.map((i) => i.id));
  const storeIds = new Set(stores.map((s) => s.id));

  const byPair = new Map<string, { record: Price; source: string }>();
  for (const [source, records] of sources) {
    for (const record of records) {
      if (!items.has(record.item)) throw new Error(`${source} names '${record.item}', which isn't in the price table`);
      if (!storeIds.has(record.store)) throw new Error(`${source} prices '${record.item}' at unknown store '${record.store}'`);
      if (record.source === "placeholder") throw new Error(`${source} sent a placeholder for '${record.item}'; sources send real prices only`);
      const pair = `${record.item}@${record.store}`;
      const clash = byPair.get(pair);
      if (clash) throw new Error(`'${record.item}' at '${record.store}' comes from both ${clash.source} and ${source}`);
      byPair.set(pair, { record, source });
    }
  }

  const real = [...byPair.values()].map((v) => v.record);
  const pricedItems = new Set(real.map((r) => r.item));
  const placeholders = current.prices.filter((p) => p.source === "placeholder" && !pricedItems.has(p.item));
  const unpriced = current.items.filter((i) => !pricedItems.has(i.id) && !placeholders.some((p) => p.item === i.id));
  if (unpriced.length) throw new Error(`no price at all for ${unpriced.map((i) => `'${i.id}'`).join(", ")}`);

  // Keep the table's item order, so a refresh diff shows only what changed.
  const order = new Map(current.items.map((i, n) => [i.id, n]));
  const prices = [...real, ...placeholders].sort(
    (a, b) => order.get(a.item)! - order.get(b.item)! || (a.store < b.store ? -1 : a.store > b.store ? 1 : 0),
  );
  return { schema: 2, version: publishDate, stores: [...stores], items: [...current.items], prices };
}

export interface Coverage {
  items: { statcan: number; manual: number; store: number; real: number; placeholder: number; total: number };
  groups: { real: number; mixed: number; placeholder: number; total: number };
  /** Groups with no real price at all: every card using one says "Sample prices". */
  placeholderGroups: string[];
}

export function coverage(v: Vocabulary): Coverage {
  const withSource = (src: Price["source"]) => new Set(v.prices.filter((p) => p.source === src).map((p) => p.item)).size;
  const real = v.items.filter((i) => v.hasRealPrice(i.id)).length;
  const groups = v.groupList().map((g) => g.group);
  const status = (g: string) => {
    const items = v.itemsFor(g);
    return items.every((i) => v.hasRealPrice(i.id)) ? "real" : items.some((i) => v.hasRealPrice(i.id)) ? "mixed" : "placeholder";
  };
  const s = groups.map((g) => [g, status(g)] as const);
  return {
    items: { statcan: withSource("statcan"), manual: withSource("manual"), store: withSource("store"), real, placeholder: v.items.length - real, total: v.items.length },
    groups: {
      real: s.filter(([, x]) => x === "real").length,
      mixed: s.filter(([, x]) => x === "mixed").length,
      placeholder: s.filter(([, x]) => x === "placeholder").length,
      total: groups.length,
    },
    placeholderGroups: s.filter(([, x]) => x === "placeholder").map(([g]) => g),
  };
}
