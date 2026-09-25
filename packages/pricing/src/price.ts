import type { Card, Pricing } from "@pantry/contract";
import { NO_DIET, type Diet, type Price, type Vocabulary } from "@pantry/vocabulary";

/** One way to buy a group: an item at a store, at its price on the day priced. */
export interface ItemOption {
  /** `item@store`: what the meal screen's swap picks. */
  id: string;
  item: string;
  store: string;
  name: string;
  unit: string;
  /** In effect on the day priced: the sale price while the sale runs, else regular. */
  price: number;
  regular: number;
  /** YYYY-MM-DD the sale ends, when `price` is a sale price. */
  sale_ends: string | null;
  placeholder: boolean;
  /** YYYY-MM-DD the price was set; null for placeholders. */
  updated: string | null;
}

export interface PriceOptions {
  /** The day being priced, YYYY-MM-DD: decides whether a sale still runs. */
  on: string;
  diet?: Diet;
  /** Group → option id (`item@store`) picked on the meal screen. Otherwise the default pick. */
  choices?: Readonly<Record<string, string>>;
}

type Table = Pick<Vocabulary, "itemsFor" | "pricesFor">;

const cents = (dollars: number) => Math.round(dollars * 100);
const dollars = (c: number) => c / 100;

/** The price in effect on a day: a sale's price up to and including its end date, then the regular price. */
export function effectivePrice(p: Pick<Price, "regular" | "sale">, on: string): { price: number; sale_ends: string | null } {
  return p.sale && on <= p.sale.ends ? { price: p.sale.price, sale_ends: p.sale.ends } : { price: p.regular, sale_ends: null };
}

/**
 * Every way to buy a group under the diet: each item at each store that
 * prices it. Real prices first, cheapest first (on the day), then
 * placeholders, cheapest first. Ties go to the lowest id, so the pick never
 * shifts between runs. A placeholder is only picked when the group has no
 * real price, so an invented number never beats a real one.
 */
export function itemOptions(table: Table, group: string, on: string, diet: Diet = NO_DIET): ItemOption[] {
  return table
    .itemsFor(group, diet)
    .flatMap((item) =>
      table.pricesFor(item.id).map((p): ItemOption => {
        const now = effectivePrice(p, on);
        return {
          id: `${item.id}@${p.store}`,
          item: item.id,
          store: p.store,
          name: item.name,
          unit: item.unit,
          price: now.price,
          regular: p.regular,
          sale_ends: now.sale_ends,
          placeholder: p.source === "placeholder",
          updated: p.updated,
        };
      }),
    )
    .sort(
      (a, b) =>
        Number(a.placeholder) - Number(b.placeholder) || cents(a.price) - cents(b.price) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Prices one card (SPEC §9) on a given day. The engine never states a price;
 * every dollar figure the user sees comes from here.
 *
 * 1. Resolve each group to its cheapest real-priced option (or the one
 *    picked); a placeholder only when the group has no real price.
 * 2. Price it at the full minimum sellable unit, at the sale price while a
 *    sale runs.
 * 3. Merge a group that appears twice; needed wins over completes.
 * 4. Fill the budget: every needed item, then completes in order. One that
 *    doesn't fit is skipped; cheaper ones after it may still fit.
 * 5. What's left over is "to complete".
 *
 * All sums are in whole cents.
 */
export function priceCard(card: Card, budget: number, table: Table, opts: PriceOptions): Pricing {
  const { on } = opts;
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
    const options = itemOptions(table, group, on, diet);
    const pick = options.find((o) => o.id === choices[group]) ?? options[0];
    if (!pick) throw new Error(`no item for group '${group}' under this diet`);
    placeholder ||= pick.placeholder;
    // The oldest real price on the card dates the whole card.
    const month = pick.updated?.slice(0, 7) ?? null;
    if (month && (asOf === null || month < asOf)) asOf = month;
    return { group, item: pick.name, unit: pick.unit, cents: cents(pick.price), store: pick.store, sale_ends: pick.sale_ends };
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

  const out = (l: (typeof lines)[number]) => ({
    group: l.group,
    item: l.item,
    unit: l.unit,
    price: dollars(l.cents),
    store: l.store,
    sale_ends: l.sale_ends,
  });
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
