import type { Card, Pricing } from "@pantry/contract";
import { NO_DIET, type Diet, type Item, type Vocabulary } from "@pantry/vocabulary";

/** An item a group can resolve to, at its minimum sellable unit. */
export interface ItemOption {
  id: string;
  name: string;
  unit: string;
  price: number;
  placeholder: boolean;
  /** YYYY-MM-DD the price was set; null for placeholders. */
  updated: string | null;
}

export interface PriceOptions {
  diet?: Diet;
  /** Group → item id picked on the meal screen. Otherwise the cheapest. */
  choices?: Readonly<Record<string, string>>;
}

type Table = Pick<Vocabulary, "itemsFor">;

const cents = (dollars: number) => Math.round(dollars * 100);
const dollars = (c: number) => c / 100;

/**
 * Items the diet allows in a group: real prices first, cheapest first, then
 * placeholders, cheapest first. Equal prices go to the lowest id, so the pick
 * never shifts between runs. A placeholder is only picked when the group has
 * no real price, so an invented number never beats a real one.
 */
export function itemOptions(table: Table, group: string, diet: Diet = NO_DIET): ItemOption[] {
  return table
    .itemsFor(group, diet)
    .map((i: Item) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      price: i.price!,
      placeholder: i.price_source === "placeholder",
      updated: i.price_source === "placeholder" ? null : i.updated,
    }))
    .sort(
      (a, b) =>
        Number(a.placeholder) - Number(b.placeholder) || cents(a.price) - cents(b.price) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Prices one card (SPEC §9). The engine never states a price; every dollar
 * figure the user sees comes from here.
 *
 * 1. Resolve each group to its cheapest real-priced item (or the one picked);
 *    a placeholder only when the group has no real price.
 * 2. Price it at the full minimum sellable unit.
 * 3. Merge a group that appears twice; needed wins over completes.
 * 4. Fill the budget: every needed item, then completes in order. One that
 *    doesn't fit is skipped; cheaper ones after it may still fit.
 * 5. What's left over is "to complete".
 *
 * All sums are in whole cents.
 */
export function priceCard(card: Card, budget: number, table: Table, opts: PriceOptions = {}): Pricing {
  const diet = opts.diet ?? NO_DIET;
  const choices = opts.choices ?? {};

  // 3. Merge, keeping first position; needed if any copy is needed.
  const merged = new Map<string, "needed" | "completes">();
  for (const m of card.missing) {
    merged.set(m.group, merged.get(m.group) === "needed" || m.role === "needed" ? "needed" : "completes");
  }

  // 1–2. Resolve and price.
  let placeholder = false;
  let asOf: string | null = null;
  const line = (group: string) => {
    const options = itemOptions(table, group, diet);
    const pick = options.find((o) => o.id === choices[group]) ?? options[0];
    if (!pick) throw new Error(`no item for group '${group}' under this diet`);
    placeholder ||= pick.placeholder;
    // The oldest real price on the card dates the whole card.
    const month = pick.updated?.slice(0, 7) ?? null;
    if (month && (asOf === null || month < asOf)) asOf = month;
    return { group, item: pick.name, unit: pick.unit, cents: cents(pick.price) };
  };
  const lines = [...merged].map(([group, role]) => ({ ...line(group), role }));

  // 4. Needed first, all of them, even over budget.
  const budgetCents = cents(budget);
  const buy = lines.filter((l) => l.role === "needed");
  let total = buy.reduce((s, l) => s + l.cents, 0);
  const toComplete: typeof lines = [];
  for (const l of lines.filter((x) => x.role === "completes")) {
    if (total + l.cents <= budgetCents) {
      buy.push(l);
      total += l.cents;
    } else toComplete.push(l);
  }

  const out = (l: (typeof lines)[number]) => ({ group: l.group, item: l.item, unit: l.unit, price: dollars(l.cents) });
  return {
    buy: buy.map((l) => ({ ...out(l), role: l.role })),
    to_complete: toComplete.map(out),
    total: dollars(total),
    budget,
    over_by: dollars(Math.max(0, total - budgetCents)),
    complete_cost: dollars(toComplete.reduce((s, l) => s + l.cents, 0)),
    placeholder,
    as_of: placeholder ? null : asOf,
  };
}
