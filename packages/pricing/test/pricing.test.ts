import { budgetStatus, type Card, type PricedCard } from "@pantry/contract";
import { loadVocabulary, vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { itemOptions, priceCard, sortDeck } from "../src";

// A small hand-set table, so the money in these tests never moves when the
// shipped placeholder prices do. Figures follow the SPEC §9 example.
const item = (id: string, family: string, group: string, name: string, unit: string, price: number, extra: object = {}) => ({
  id, family, group, name, unit, price, price_source: "statcan", updated: "2026-09-01", ...extra,
});
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
  table: {
    version: "2026-09",
    items: [
      item("pollock", "fish", "white_fish", "Pollock fillets, frozen", "454g", 7.49),
      item("basa", "fish", "white_fish", "Basa fillets, frozen", "400g", 6.49),
      item("seasoning", "spices", "seasoning", "Seasoning blend", "250g", 7.0),
      item("veg", "vegetables", "frozen_veg", "Frozen mixed veg", "750g", 2.0),
      item("spinach_b", "vegetables", "spinach", "Spinach, bunch", "bunch", 0.2),
      item("spinach_a", "vegetables", "spinach", "Spinach, bag", "142g", 0.2),
      item("thighs", "poultry", "chicken_thighs", "Chicken thighs", "1 kg", 8.99, { halal: false }),
      item("thighs_halal", "poultry", "chicken_thighs", "Chicken thighs, halal", "1 kg", 10.49, { halal: true }),
      item("lentils", "legumes", "lentils", "Lentils", "900g", 0.1),
    ],
  },
});

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
    expect(priceCard(spec, 15, table)).toEqual({
      buy: [
        { group: "white_fish", item: "Basa fillets, frozen", unit: "400g", price: 6.49, role: "needed" },
        { group: "seasoning", item: "Seasoning blend", unit: "250g", price: 7.0, role: "needed" },
      ],
      to_complete: [{ group: "frozen_veg", item: "Frozen mixed veg", unit: "750g", price: 2.0 }],
      total: 13.49,
      budget: 15,
      over_by: 0,
      complete_cost: 2.0,
      placeholder: false,
    });
  });

  it("prices the full sellable unit: a pinch of seasoning is $7", () => {
    const p = priceCard(card([{ group: "seasoning", qty: "a pinch", role: "needed" }]), 15, table);
    expect(p.total).toBe(7);
  });

  it("merges a group that appears twice, needed winning", () => {
    const p = priceCard(card([{ group: "white_fish", qty: "150g", role: "completes" }, { group: "white_fish", qty: "150g", role: "needed" }]), 15, table);
    expect(p.buy).toEqual([expect.objectContaining({ group: "white_fish", role: "needed", price: 6.49 })]);
    expect(p.total).toBe(6.49);
  });

  it("keeps every needed item when they alone are over budget, and says by how much", () => {
    const p = priceCard(spec, 10, table);
    expect(p.buy.map((b) => b.group)).toEqual(["white_fish", "seasoning"]);
    expect(p).toMatchObject({ total: 13.49, over_by: 3.49, complete_cost: 2 });
  });

  it("skips a completes item that doesn't fit; a cheaper one after it still fits", () => {
    const c = card([
      { group: "white_fish", qty: "300g", role: "needed" },
      { group: "chicken_thighs", qty: "2", role: "completes" },
      { group: "spinach", qty: "2 cups", role: "completes" },
    ]);
    const p = priceCard(c, 8, table);
    expect(p.buy.map((b) => b.group)).toEqual(["white_fish", "spinach"]);
    expect(p.to_complete.map((t) => t.group)).toEqual(["chicken_thighs"]);
    expect(p).toMatchObject({ total: 6.69, over_by: 0, complete_cost: 8.99 });
  });

  it("with a zero budget, buys what's needed and shows it over", () => {
    expect(priceCard(spec, 0, table)).toMatchObject({ total: 13.49, over_by: 13.49, complete_cost: 2 });
  });

  it("adds in whole cents: no 0.30000000000000004", () => {
    const p = priceCard(card([{ group: "lentils", qty: "1 cup", role: "needed" }, { group: "spinach", qty: "1 cup", role: "needed" }]), 5, table);
    expect(p.total).toBe(0.3);
  });

  it("breaks price ties by lowest item id", () => {
    expect(itemOptions(table, "spinach").map((o) => o.id)).toEqual(["spinach_a", "spinach_b"]);
  });

  it("halal resolves meat to halal-certified items", () => {
    const c = card([{ group: "chicken_thighs", qty: "2", role: "needed" }]);
    expect(priceCard(c, 20, table).buy[0]?.item).toBe("Chicken thighs");
    expect(priceCard(c, 20, table, { diet: { halal: true } }).buy[0]?.item).toBe("Chicken thighs, halal");
  });

  it("a swap re-prices the card and can move a completes item out", () => {
    const p = priceCard(spec, 15.5, table);
    expect(p.buy.map((b) => b.group)).toContain("frozen_veg");
    const swapped = priceCard(spec, 15.5, table, { choices: { white_fish: "pollock" } });
    expect(swapped.buy.find((b) => b.group === "white_fish")?.item).toBe("Pollock fillets, frozen");
    expect(swapped.to_complete.map((t) => t.group)).toEqual(["frozen_veg"]);
    expect(swapped.total).toBe(14.49);
  });

  it("an unknown choice falls back to the cheapest", () => {
    expect(priceCard(spec, 15, table, { choices: { white_fish: "gone" } }).total).toBe(13.49);
  });

  it("flags placeholder prices so the UI never calls them typical", () => {
    const withPlaceholder = table.withTable({
      version: "2026-09-placeholder",
      items: table.items.map((i) => (i.id === "seasoning" ? { ...i, price_source: "placeholder", updated: null } : i)),
    });
    expect(priceCard(spec, 15, withPlaceholder).placeholder).toBe(true);
    expect(priceCard(card([{ group: "white_fish", qty: "1", role: "needed" }]), 15, withPlaceholder).placeholder).toBe(false);
  });

  it("throws when a group has no item under the diet", () => {
    expect(() => priceCard(card([{ group: "nope", qty: "1", role: "needed" }]), 15, table)).toThrow(/no item for group 'nope'/);
  });
});

describe("sortDeck (SPEC §10)", () => {
  const priced = (name: string, protein_g: number, pricing: Partial<PricedCard["pricing"]>): PricedCard => ({
    card: card([], { id: name, name, protein_g }),
    pricing: { buy: [], to_complete: [], total: 10, budget: 15, over_by: 0, complete_cost: 0, placeholder: false, ...pricing },
  });
  const extra = { to_complete: [{ group: "g", item: "i", unit: "u", price: 2 }], complete_cost: 2 };

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
      for (const g of vocabulary.groupList(diet)) expect(itemOptions(vocabulary, g.group, diet).length).toBeGreaterThan(0);
    }
  });

  it("is placeholder, and pricing says so", () => {
    const p = priceCard(spec, 15, vocabulary);
    expect(p.placeholder).toBe(true);
    expect(p.total).toBeGreaterThan(0);
  });
});
