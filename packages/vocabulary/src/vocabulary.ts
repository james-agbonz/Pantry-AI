import type { GroupRef } from "@pantry/contract";
import { FLAVOUR_FAMILIES, MEAT_FAMILIES, VocabularyData, type Family, type Group, type Item, type Price, type Store } from "./schema";

/** Diet rules that act on items rather than on `exclude` terms. */
export interface Diet {
  /** Meat groups resolve to halal-certified items only. */
  halal: boolean;
}

export const NO_DIET: Diet = { halal: false };

export interface Vocabulary {
  families: readonly Family[];
  groups: readonly Group[];
  stores: readonly Store[];
  items: readonly Item[];
  prices: readonly Price[];
  /** Items the diet allows in a group. */
  itemsFor(group: string, diet?: Diet): Item[];
  /** Every price for an item, one per store. At least one: the load refuses an unpriced item. */
  pricesFor(item: string): Price[];
  /** True when the item has at least one price that isn't a placeholder. */
  hasRealPrice(item: string): boolean;
  /**
   * Groups with at least one item the diet allows. This list goes to the
   * engine prompt and to `validateCard`, so a halal deck can't ask for a
   * meat group with no halal item (bacon, ham, ground chicken…).
   */
  groupList(diet?: Diet): GroupRef[];
  /** The price table's publish date, e.g. "2026-09-25". */
  version: string;
  /** True while any item has no real price: some cards will still say "Sample prices". */
  placeholder: boolean;
  /** The same families and groups with another price table. Throws if the table doesn't fit them. */
  withTable(table: unknown): Vocabulary;
}

/** Parses and checks the raw data; throws if any rule in the schema breaks. */
export function loadVocabulary(raw: unknown): Vocabulary {
  const data = VocabularyData.parse(raw);
  const { families, groups, table } = data;
  const { items, prices, stores } = table;

  const byGroup = new Map<string, Item[]>();
  for (const item of items) {
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }
  const byItem = new Map<string, Price[]>();
  for (const p of prices) {
    const list = byItem.get(p.item) ?? [];
    list.push(p);
    byItem.set(p.item, list);
  }

  const itemsFor = (group: string, diet: Diet = NO_DIET): Item[] =>
    (byGroup.get(group) ?? []).filter((i) => !diet.halal || !MEAT_FAMILIES.includes(i.family) || i.halal === true);
  const pricesFor = (item: string): Price[] => byItem.get(item) ?? [];
  const hasRealPrice = (item: string) => pricesFor(item).some((p) => p.source !== "placeholder");

  const groupList = (diet: Diet = NO_DIET): GroupRef[] =>
    groups
      .filter((g) => itemsFor(g.id, diet).length > 0)
      .map((g) => ({
        group: g.id,
        family: g.family,
        contains: g.contains,
        label: g.label,
        flavour: g.flavour === true || FLAVOUR_FAMILIES.includes(g.family),
      }));

  return {
    families,
    groups,
    stores,
    items,
    prices,
    itemsFor,
    pricesFor,
    hasRealPrice,
    groupList,
    version: table.version,
    placeholder: items.some((i) => !hasRealPrice(i.id)),
    withTable: (next: unknown) => loadVocabulary({ families, groups, table: next }),
  };
}
