import { budgetStatus, type Card, type PricedCard } from "@pantry/contract";
import { loadVocabulary, vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { itemOptions, priceCard, sortDeck } from "../src";

// A small hand-set table, so the money in these tests never moves when the
// shipped prices do. Figures follow the SPEC §9 example.
const ON = "2026-09-25";
const item = (id: string, family: string, group: string, name: string, unit: string, extra: object = {}) => ({ id, family, group, name, unit, ...extra });
const price = (item: string, regular: number, extra: object = {}) => ({ item, store: "ca_typical", regular, sale: null, source: "statcan", updated: "2026-09-01", ...extra });
const tableData = {
  schema: 2,
  version: "2026-09-01",
  stores: [
    { id: "ca_typical", name: "Typical price, Canada", kind: "average" },
    { id: "shop", name: "A shop", kind: "store", region: "Toronto" },
  ],
  items: [
    item("pollock", "fish", "white_fish", "Pollock fillets, frozen", "454g"),
    item("basa", "fish", "white_fish", "Basa fillets, frozen", "400g"),
    item("seasoning", "spices", "seasoning", "Seasoning blend", "250g"),
    item("veg", "vegetables", "frozen_veg", "Frozen mixed veg", "750g"),
    item("spinach_b", "vegetables", "spinach", "Spinach, bunch", "bunch"),
    item("spinach_a", "vegetables", "spinach", "Spinach, bag", "142g"),
    item("thighs", "poultry", "chicken_thighs", "Chicken thighs", "1 kg", { halal: false }),
    item("thighs_halal", "poultry", "chicken_thighs", "Chicken thighs, halal", "1 kg", { halal: true }),
    item("lentils", "legumes", "lentils", "Lentils", "900g"),
  ],
  prices: [
    price("pollock", 7.49),
    price("basa", 6.49),
    price("seasoning", 7.0),
    price("veg", 2.0),
    price("spinach_b", 0.2),
    price("spinach_a", 0.2),
    price("thighs", 8.99),
    price("thighs_halal", 10.49),
    price("lentils", 0.1),
  ],
};
const table = loadVocabulary({
  families: [
    { id: "fish", label: "Fish" },
    { id: "spices", label: "Spices" },
    { id: "vegetables", label: "Vegetables" },
    { id: "poultry", label: "Poultry" },
    { id: "legumes", label: "Legumes" },
  ],
  groups: [
    { id: "white_fish", family: "fish", label: "White fish", contains: ["fish"] },
    { id: "seasoning", family: "spices", label: "Seasoning blend", contains: [] },
    { id: "frozen_veg", family: "vegetables", label: "Frozen mixed veg", contains: [] },
    { id: "spinach", family: "vegetables", label: "Spinach", contains: [] },
    { id: "chicken_thighs", family: "poultry", label: "Chicken thighs", contains: [] },
    { id: "lentils", family: "legumes", label: "Lentils", contains: [] },
  ],
  table: tableData,
});
/** The fixture table with some prices replaced. */
const withPrices = (version: string, change: (p: (typeof tableData.prices)[number]) => object) =>
  table.withTable({ ...tableData, version, prices: tableData.prices.map((p) => ({ ...p, ...change(p) })) });

const card = (missing: Card["missing"], extra: Partial<Card> = {}): Card => ({
  id: "c",
  name: "Fish and corn rice bowl",
  time_min: 25,
  kcal: 560,
  protein_g: 38,
  uses: ["rice", "corn"],
  missing,
  methods: ["stove"],
  steps: ["Cook."],
  image_prompt: "",
  ...extra,
});
const spec = card([
  { group: "white_fish", qty: "300g", role: "needed" },
  { group: "seasoning", qty: "1 tsp", role: "needed" },
  { group: "frozen_veg", qty: "1 cup", role: "completes" },
]);

describe("priceCard (SPEC §9)", () => {
  it("reproduces the SPEC worked example exactly", () => {
    expect(priceCard(spec, 15, table, { on: ON })).toEqual({
      buy: [
        { group: "white_fish", item: "Basa fillets, frozen", unit: "400g", price: 6.49, store: "ca_typical", sale_ends: null, role: "needed" },
        { group: "seasoning", item: "Seasoning blend", unit: "250g", price: 7.0, store: "ca_typical", sale_ends: null, role: "needed" },
      ],
      to_complete: [{ group: "frozen_veg", item: "Frozen mixed veg", unit: "750g", price: 2.0, store: "ca_typical", sale_ends: null }],
      total: 13.49,
      budget: 15,
      over_by: 0,
      complete_cost: 2.0,
      placeholder: false,
      as_of: "2026-09",
    });
  });

  it("prices the full sellable unit: a pinch of seasoning is $7", () => {
    const p = priceCard(card([{ group: "seasoning", qty: "a pinch", role: "needed" }]), 15, table, { on: ON });
    expect(p.total).toBe(7);
  });

  it("merges a group that appears twice, needed winning", () => {
    const p = priceCard(card([{ group: "white_fish", qty: "150g", role: "completes" }, { group: "white_fish", qty: "150g", role: "needed" }]), 15, table, { on: ON });
    expect(p.buy).toEqual([expect.objectContaining({ group: "white_fish", role: "needed", price: 6.49 })]);
    expect(p.total).toBe(6.49);
  });

  it("keeps every needed item when they alone are over budget, and says by how much", () => {
    const p = priceCard(spec, 10, table, { on: ON });
    expect(p.buy.map((b) => b.group)).toEqual(["white_fish", "seasoning"]);
    expect(p).toMatchObject({ total: 13.49, over_by: 3.49, complete_cost: 2 });
  });

  it("skips a completes item that doesn't fit; a cheaper one after it still fits", () => {
    const c = card([
      { group: "white_fish", qty: "300g", role: "needed" },
      { group: "chicken_thighs", qty: "2", role: "completes" },
      { group: "spinach", qty: "2 cups", role: "completes" },
    ]);
    const p = priceCard(c, 8, table, { on: ON });
    expect(p.buy.map((b) => b.group)).toEqual(["white_fish", "spinach"]);
    expect(p.to_complete.map((t) => t.group)).toEqual(["chicken_thighs"]);
    expect(p).toMatchObject({ total: 6.69, over_by: 0, complete_cost: 8.99 });
  });

  it("with a zero budget, buys what's needed and shows it over", () => {
    expect(priceCard(spec, 0, table, { on: ON })).toMatchObject({ total: 13.49, over_by: 13.49, complete_cost: 2 });
  });

  it("adds in whole cents: no 0.30000000000000004", () => {
    const p = priceCard(card([{ group: "lentils", qty: "1 cup", role: "needed" }, { group: "spinach", qty: "1 cup", role: "needed" }]), 5, table, { on: ON });
    expect(p.total).toBe(0.3);
  });

  it("breaks price ties by lowest item id", () => {
    expect(itemOptions(table, "spinach", ON).map((o) => o.id)).toEqual(["spinach_a@ca_typical", "spinach_b@ca_typical"]);
  });

  it("halal resolves meat to halal-certified items", () => {
    const c = card([{ group: "chicken_thighs", qty: "2", role: "needed" }]);
    expect(priceCard(c, 20, table, { on: ON }).buy[0]?.item).toBe("Chicken thighs");
    expect(priceCard(c, 20, table, { on: ON, diet: { halal: true } }).buy[0]?.item).toBe("Chicken thighs, halal");
  });

  it("a swap re-prices the card and can move a completes item out", () => {
    const p = priceCard(spec, 15.5, table, { on: ON });
    expect(p.buy.map((b) => b.group)).toContain("frozen_veg");
    const swapped = priceCard(spec, 15.5, table, { on: ON, choices: { white_fish: "pollock@ca_typical" } });
    expect(swapped.buy.find((b) => b.group === "white_fish")?.item).toBe("Pollock fillets, frozen");
    expect(swapped.to_complete.map((t) => t.group)).toEqual(["frozen_veg"]);
    expect(swapped.total).toBe(14.49);
  });

  it("an unknown choice falls back to the cheapest", () => {
    expect(priceCard(spec, 15, table, { on: ON, choices: { white_fish: "gone" } }).total).toBe(13.49);
  });

  it("flags placeholder prices so the UI never calls them typical", () => {
    const withPlaceholder = withPrices("2026-09-02", (p) => (p.item === "seasoning" ? { source: "placeholder", updated: null } : {}));
    expect(priceCard(spec, 15, withPlaceholder, { on: ON }).placeholder).toBe(true);
    expect(priceCard(card([{ group: "white_fish", qty: "1", role: "needed" }]), 15, withPlaceholder, { on: ON }).placeholder).toBe(false);
  });

  it("prefers a real price over a cheaper placeholder, and uses a placeholder only when the group has no real one", () => {
    const mixed = withPrices("2026-09-03", (p) => (p.item === "basa" ? { regular: 0.99, source: "placeholder", updated: null } : {}));
    // Basa is cheaper but invented; pollock is real.
    expect(itemOptions(mixed, "white_fish", ON).map((o) => o.id)).toEqual(["pollock@ca_typical", "basa@ca_typical"]);
    const p = priceCard(card([{ group: "white_fish", qty: "300g", role: "needed" }]), 15, mixed, { on: ON });
    expect(p).toMatchObject({ total: 7.49, placeholder: false, as_of: "2026-09" });

    const allInvented = withPrices("2026-09-04", (p) =>
      p.item === "basa" ? { regular: 0.99, source: "placeholder", updated: null } : p.item === "pollock" ? { source: "placeholder", updated: null } : {},
    );
    expect(priceCard(card([{ group: "white_fish", qty: "300g", role: "needed" }]), 15, allInvented, { on: ON })).toMatchObject({ total: 0.99, placeholder: true, as_of: null });
  });

  it("dates the card by its oldest price", () => {
    const dated = withPrices("2026-09-05", (p) => (p.item === "seasoning" ? { updated: "2026-07-01" } : {}));
    expect(priceCard(spec, 15, dated, { on: ON }).as_of).toBe("2026-07");
    expect(priceCard(card([{ group: "white_fish", qty: "1", role: "needed" }]), 15, dated, { on: ON }).as_of).toBe("2026-09");
  });

  it("throws when a group has no item under the diet", () => {
    expect(() => priceCard(card([{ group: "nope", qty: "1", role: "needed" }]), 15, table, { on: ON })).toThrow(/no item for group 'nope'/);
  });
});

describe("stores and sales", () => {
  // Basa on sale at the shop: $4.99 until Oct 5, $6.99 regular.
  const onSale = table.withTable({
    ...tableData,
    version: "2026-09-06",
    prices: [
      ...tableData.prices,
      { item: "basa", store: "shop", regular: 6.99, sale: { price: 4.99, ends: "2026-10-05" }, source: "manual", updated: "2026-09-25" },
    ],
  });
  const fish = card([{ group: "white_fish", qty: "300g", role: "needed" }]);

  it("uses the sale price up to and including its end date", () => {
    expect(priceCard(fish, 15, onSale, { on: "2026-10-05" }).buy[0]).toMatchObject({ item: "Basa fillets, frozen", price: 4.99, store: "shop", sale_ends: "2026-10-05" });
  });

  it("goes back to the regular price the day after, which may no longer be cheapest", () => {
    // $6.99 at the shop is dearer than $6.49 typical, so pricing moves back.
    expect(priceCard(fish, 15, onSale, { on: "2026-10-06" }).buy[0]).toMatchObject({ price: 6.49, store: "ca_typical", sale_ends: null });
  });

  it("offers every item at every store, each line naming its store", () => {
    expect(itemOptions(onSale, "white_fish", "2026-10-01").map((o) => [o.id, o.price, o.sale_ends])).toEqual([
      ["basa@shop", 4.99, "2026-10-05"],
      ["basa@ca_typical", 6.49, null],
      ["pollock@ca_typical", 7.49, null],
    ]);
  });

  it("a real price at any store beats a placeholder at another", () => {
    const t = table.withTable({
      ...tableData,
      version: "2026-09-07",
      prices: [
        ...tableData.prices.map((p) => (p.item === "lentils" ? { ...p, regular: 0.05, source: "placeholder", updated: null } : p)),
        { item: "lentils", store: "shop", regular: 2.49, sale: null, source: "manual", updated: "2026-09-25" },
      ],
    });
    expect(priceCard(card([{ group: "lentils", qty: "1 cup", role: "needed" }]), 15, t, { on: ON })).toMatchObject({ total: 2.49, placeholder: false });
  });

  it("a swap can pick an item at a particular store", () => {
    const p = priceCard(fish, 15, onSale, { on: ON, choices: { white_fish: "pollock@ca_typical" } });
    expect(p.buy[0]).toMatchObject({ item: "Pollock fillets, frozen", store: "ca_typical" });
  });
});

describe("sortDeck (SPEC §10)", () => {
  const priced = (name: string, protein_g: number, pricing: Partial<PricedCard["pricing"]>): PricedCard => ({
    card: card([], { id: name, name, protein_g }),
    pricing: { buy: [], to_complete: [], total: 10, budget: 15, over_by: 0, complete_cost: 0, placeholder: false, as_of: null, ...pricing },
  });
  const extra = { to_complete: [{ group: "g", item: "i", unit: "u", price: 2, store: "ca_typical", sale_ends: null }], complete_cost: 2 };

  it("fits, then fits-but-needs-extra, then over budget least over first", () => {
    const deck = [
      priced("over3", 30, { over_by: 3 }),
      priced("extra", 30, extra),
      priced("over1", 30, { over_by: 1 }),
      priced("fits", 30, {}),
    ];
    expect(sortDeck(deck, null).map((d) => d.card.name)).toEqual(["fits", "extra", "over1", "over3"]);
    expect(sortDeck(deck, null).map((d) => budgetStatus(d.pricing))).toEqual(["fits", "complete", "over", "over"]);
  });

  it("within a tier, closest to a third of daily protein first", () => {
    const deck = [priced("p20", 20, {}), priced("p45", 45, {}), priced("p38", 38, {})];
    // 120 g a day → 40 g a meal.
    expect(sortDeck(deck, { kcal: 2400, protein: 120 }).map((d) => d.card.name)).toEqual(["p38", "p45", "p20"]);
  });

  it("keeps the engine's order within a tier when there are no targets", () => {
    const deck = [priced("a", 20, {}), priced("b", 45, {}), priced("c", 38, {})];
    expect(sortDeck(deck, null).map((d) => d.card.name)).toEqual(["a", "b", "c"]);
  });

  it("doesn't change the input", () => {
    const deck = [priced("over", 30, { over_by: 1 }), priced("fits", 30, {})];
    sortDeck(deck, null);
    expect(deck.map((d) => d.card.name)).toEqual(["over", "fits"]);
  });
});

describe("the shipped price table", () => {
  it("prices every group the engine can ask for, with and without halal", () => {
    for (const diet of [{ halal: false }, { halal: true }]) {
      for (const g of vocabulary.groupList(diet)) expect(itemOptions(vocabulary, g.group, ON, diet).length).toBeGreaterThan(0);
    }
  });

  it("is placeholder, and pricing says so", () => {
    const p = priceCard(spec, 15, vocabulary, { on: ON });
    expect(p.placeholder).toBe(true);
    expect(p.total).toBeGreaterThan(0);
  });
});
