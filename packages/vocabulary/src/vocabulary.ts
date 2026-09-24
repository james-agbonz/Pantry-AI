import type { GroupRef } from "@pantry/contract";
import { FLAVOUR_FAMILIES, MEAT_FAMILIES, VocabularyData, type Family, type Group, type Item } from "./schema";

/** Diet rules that act on items rather than on `exclude` terms. */
export interface Diet {
  /** Meat groups resolve to halal-certified items only. */
  halal: boolean;
}

export const NO_DIET: Diet = { halal: false };

export interface Vocabulary {
  families: readonly Family[];
  groups: readonly Group[];
  items: readonly Item[];
  /** Items the diet allows in a group. Pricing picks the cheapest of these. */
  itemsFor(group: string, diet?: Diet): Item[];
  /**
   * Groups with at least one item the diet allows. This list goes to the
   * engine prompt and to `validateCard`, so a halal deck can't ask for a
   * meat group with no halal item (bacon, ham, ground chicken…).
   */
  groupList(diet?: Diet): GroupRef[];
  /** The price table's version, e.g. "2026-10". */
  version: string;
  /** True while any price is a placeholder: the UI must not call them typical. */
  placeholder: boolean;
  /** The same families and groups with another price table. Throws if the table doesn't fit them. */
  withTable(table: unknown): Vocabulary;
}

/** Parses and checks the raw data; throws if any rule in the schema breaks. */
export function loadVocabulary(raw: unknown): Vocabulary {
  const data = VocabularyData.parse(raw);
  const { families, groups, table } = data;
  const items = table.items;

  const byGroup = new Map<string, Item[]>();
  for (const item of items) {
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }

  const itemsFor = (group: string, diet: Diet = NO_DIET): Item[] =>
    (byGroup.get(group) ?? []).filter((i) => !diet.halal || !MEAT_FAMILIES.includes(i.family) || i.halal === true);

  const groupList = (diet: Diet = NO_DIET): GroupRef[] =>
    groups.filter((g) => itemsFor(g.id, diet).length > 0).map((g) => ({
        group: g.id,
        family: g.family,
        contains: g.contains,
        label: g.label,
        flavour: g.flavour === true || FLAVOUR_FAMILIES.includes(g.family),
      }));

  return {
    families,
    groups,
    items,
    itemsFor,
    groupList,
    version: table.version,
    placeholder: items.some((i) => i.price_source === "placeholder"),
    withTable: (next: unknown) => loadVocabulary({ families, groups, table: next }),
  };
}
