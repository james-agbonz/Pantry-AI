import { itemOptions } from "@pantry/pricing";
import type { Vocabulary } from "@pantry/vocabulary";
import type { ManualRow } from "./manual";

/**
 * Hand-entry order. A card says "Sample prices" while any line on it has no
 * real price, and a group gets a real price from just one real item (pricing
 * prefers real prices). So the list puts one item per unpriced group first,
 * in order of how many cards the group is likely to be on, and alternatives
 * last. The within-tier order is judgment until real decks give counts.
 */
const EVERYDAY_FLAVOUR = [
  "cooking_oil", "salt", "black_pepper", "garlic", "seasoning", "garlic_powder", "chili_powder", "cumin",
  "paprika", "italian_seasoning", "curry_powder", "soy_sauce", "chili_flakes", "olive_oil", "tomato_paste",
  "vegetable_broth", "chicken_broth", "green_onion", "cinnamon", "vinegar", "hot_sauce", "mustard", "beef_broth",
  "bbq_sauce", "salsa", "brown_sugar", "honey", "baking_powder",
];
const PROTEIN = [
  "white_fish", "ground_chicken", "ground_turkey", "tofu", "cheese", "chicken_breast", "shrimp", "sardines",
  "ground_pork", "bacon", "pork_sausage", "ground_lamb", "deli_turkey", "ham", "fish_sticks", "beef_steak",
  "peanuts", "almonds", "mixed_nuts", "almond_butter", "sunflower_seeds", "sour_cream", "parmesan",
];
const STAPLES = [
  "pasta", "carrot", "cabbage", "bell_pepper", "tomato", "oats", "tortillas", "egg_noodles", "instant_noodles",
  "rice_noodles", "orange", "zucchini", "pita", "couscous", "cornmeal", "barley", "buns", "bagels", "crackers",
  "coconut_milk", "frozen_berries", "raisins",
];

interface Ranked {
  item_id: string;
  group: string;
  name: string;
  unit: string;
  tier: number;
  order: number;
  why: string;
}

/** Placeholder items in hand-entry order, each with why it sits there. */
export function rankPlaceholders(v: Vocabulary, on = "2000-01-01"): Ranked[] {
  const placeholder = v.items.filter((i) => !v.hasRealPrice(i.id));
  const groupHasReal = (g: string, halal: boolean) => v.itemsFor(g, { halal }).some((i) => v.hasRealPrice(i.id));
  // The item pricing would pick in each group: the one that clears "Sample prices" for that group.
  const unblocking = new Set(
    v.groupList().filter((g) => !groupHasReal(g.group, false)).map((g) => itemOptions(v, g.group, on)[0]!.item),
  );
  const halalUnblocking = new Set(
    v
      .groupList({ halal: true })
      .filter((g) => !groupHasReal(g.group, true))
      .map((g) => itemOptions(v, g.group, on, { halal: true })[0]!.item)
      .filter((id) => !unblocking.has(id)),
  );
  const pos = (list: string[], g: string) => (list.includes(g) ? list.indexOf(g) : list.length);

  return placeholder
    .map((i): Ranked => {
      const base = { item_id: i.id, group: i.group, name: i.name, unit: i.unit };
      if (unblocking.has(i.id)) {
        if (EVERYDAY_FLAVOUR.includes(i.group))
          return { ...base, tier: 1, order: pos(EVERYDAY_FLAVOUR, i.group), why: `Seasoning, oil or garlic on most dishes; no real price in '${i.group}', so every card using it says Sample prices` };
        if (PROTEIN.includes(i.group))
          return { ...base, tier: 2, order: pos(PROTEIN, i.group), why: `Main protein with no real price in '${i.group}'` };
        return { ...base, tier: 3, order: pos(STAPLES, i.group), why: `No real price in '${i.group}' yet` };
      }
      if (halalUnblocking.has(i.id))
        return { ...base, tier: 2, order: PROTEIN.length + 1, why: `Halal: StatCan has only the regular product, so halal users see Sample prices for '${i.group}'` };
      return { ...base, tier: 4, order: 0, why: `Alternative: '${i.group}' already has a real price or an earlier row; only changes swap options` };
    })
    .sort((a, b) => a.tier - b.tier || a.order - b.order || a.group.localeCompare(b.group) || a.item_id.localeCompare(b.item_id));
}

/**
 * The CSV rows in rank order, keeping whatever has already been typed in for
 * an item. Items that now have a StatCan price drop out.
 */
export function manualRows(v: Vocabulary, existing: readonly ManualRow[]): ManualRow[] {
  const kept = new Map(existing.map((r) => [r.item_id, r]));
  const handPriced = v.items.filter((i) => v.pricesFor(i.id).some((p) => p.source === "manual"));
  const ranked = [
    ...rankPlaceholders(v),
    // Already entered by hand: kept, at the end, so they can be updated next month.
    ...handPriced.map((i) => ({ item_id: i.id, group: i.group, name: i.name, unit: i.unit, tier: 5, order: 0, why: "Entered by hand; update when the price changes" })),
  ];
  return ranked.map((r, n) => {
    const old = kept.get(r.item_id);
    return {
      rank: String(n + 1),
      item_id: r.item_id,
      group: r.group,
      name: r.name,
      unit: r.unit,
      store: old?.store ?? "",
      price: old?.price ?? "",
      sale_price: old?.sale_price ?? "",
      sale_ends: old?.sale_ends ?? "",
      source: old?.source ?? "",
      source_detail: old?.source_detail ?? "",
      date: old?.date ?? "",
      why: r.why,
    };
  });
}
