import { validateCard, type PricedCard, type Profile } from "@pantry/contract";
import { buildConstraints } from "@pantry/engine";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { badgeFor } from "../src/deck/badge";
import { allPassed, canRewind, counterText, countDeck, dayKey, deckReducer, decksLeft, decksLeftText, passedNames, topCard, type DeckState } from "../src/deck/state";
import { kcal, money, parseBudget, protein } from "../src/format";
import { excludeTerms } from "@pantry/contract";
import { hiddenGroups, search, sections, OPEN_BY_DEFAULT } from "../src/home/groups";
import { MOCK_CARDS, mockDeckSource, mockPrice, mockSort } from "../src/mock/deck";

const profile: Profile = { goal: "eat_well", condition: null, limits: [], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: null };
const session = { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] };

describe("format", () => {
  it("puts ~ on every estimate", () => {
    expect(money(13.49)).toBe("~$13.49");
    expect(money(7)).toBe("~$7.00");
    expect(kcal(560.4)).toBe("~560 kcal");
    expect(protein(38)).toBe("~38 g protein");
  });

  it("parses a budget as typed", () => {
    expect(parseBudget("15")).toBe(15);
    expect(parseBudget(" $15.50 ")).toBe(15.5);
    expect(parseBudget("15,5")).toBe(15.5);
    for (const bad of ["", "0", "-3", "abc", "15.555", "5000"]) expect(parseBudget(bad)).toBeNull();
  });
});

describe("budget badge", () => {
  const base = { buy: [], to_complete: [], total: 13.49, budget: 15, over_by: 0, complete_cost: 0 };
  it("fits: word then figure", () => {
    expect(badgeFor(base)).toMatchObject({ status: "fits", label: "Fits ~$13.49" });
  });
  it("to complete: '+~$2.00 to complete'", () => {
    expect(badgeFor({ ...base, to_complete: [{ item: "Frozen mixed veg", price: 2 }], complete_cost: 2 })).toMatchObject({
      status: "complete",
      label: "+~$2.00 to complete",
    });
  });
  it("over: 'Over by ~$3.00', a fact, never hidden", () => {
    expect(badgeFor({ ...base, total: 18, over_by: 3 })).toMatchObject({ status: "over", label: "Over by ~$3.00" });
  });
  it("is at most three words plus the figure", () => {
    const words = badgeFor({ ...base, to_complete: [{ item: "x", price: 2 }], complete_cost: 2 }).parts.filter((p) => p.kind === "word");
    expect(words.map((w) => w.text.split(" ").length).reduce((a, b) => a + b)).toBeLessThanOrEqual(3);
  });
});

describe("deck state", () => {
  const cards = MOCK_CARDS.slice(0, 6).map((card) => ({ card, pricing: mockPrice(card, 15) }));
  const start: DeckState = { cards, index: 0 };

  it("passes, rewinds as often as wanted, and never goes out of range", () => {
    let s = deckReducer(deckReducer(start, { type: "pass" }), { type: "pass" });
    expect(topCard(s)?.card.name).toBe(cards[2]!.card.name);
    s = deckReducer(deckReducer(deckReducer(s, { type: "rewind" }), { type: "rewind" }), { type: "rewind" });
    expect(s.index).toBe(0);
    expect(canRewind(s)).toBe(false);
  });

  it("knows when everything is passed and which names to avoid next", () => {
    let s = start;
    for (let i = 0; i < 8; i++) s = deckReducer(s, { type: "pass" });
    expect(s.index).toBe(6);
    expect(allPassed(s)).toBe(true);
    expect(topCard(s)).toBeUndefined();
    expect(passedNames(s)).toEqual(cards.map((c) => c.card.name));
    expect(canRewind(s)).toBe(true);
  });

  it("counter reads '3 of 6 · 2 decks left today'", () => {
    const s = deckReducer(deckReducer(start, { type: "pass" }), { type: "pass" });
    expect(counterText(s, 2)).toBe("3 of 6 · 2 decks left today");
    expect(decksLeftText(1)).toBe("1 deck left today");
    expect(decksLeftText(0)).toBe("No decks left today");
  });

  it("counts three free decks per local day", () => {
    const today = dayKey(new Date(2026, 8, 24, 23, 59));
    expect(today).toBe("2026-09-24");
    let c = countDeck(null, today);
    expect(decksLeft(c, today)).toBe(2);
    c = countDeck(countDeck(c, today), today);
    expect(decksLeft(c, today)).toBe(0);
    expect(decksLeft(c, "2026-09-25")).toBe(3);
    expect(countDeck(c, "2026-09-25")).toEqual({ day: "2026-09-25", used: 1 });
  });
});

describe("home sections and search", () => {
  it("covers every group once, grouped by family, with the open ones real families", () => {
    const s = sections(vocabulary);
    expect(s.flatMap((x) => x.groups).length).toBe(vocabulary.groups.length);
    for (const f of OPEN_BY_DEFAULT) expect(s.map((x) => x.family)).toContain(f);
  });

  it("finds groups by word start, and offers the query as free text unless it's an exact name", () => {
    const r = search(vocabulary, "chick");
    expect(r.groups.map((g) => g.id)).toEqual(expect.arrayContaining(["chicken_thighs", "chickpeas"]));
    expect(r.freeText).toBe("chick");
    expect(search(vocabulary, "Chickpeas").freeText).toBeNull();
    expect(search(vocabulary, "leftover chili").groups).toEqual([]);
    expect(search(vocabulary, "leftover chili").freeText).toBe("leftover chili");
    expect(search(vocabulary, "  ")).toEqual({ groups: [], freeText: null });
  });
});

describe("home hides what hard limits rule out", () => {
  const families = (limits: Profile["limits"], limits_other: string[] = []) =>
    sections(vocabulary, excludeTerms({ limits, limits_other })).map((s) => s.family);
  const familyGroups = (f: string) => vocabulary.groups.filter((g) => g.family === f).map((g) => g.id);

  it("hides nothing with no limits", () => {
    expect(hiddenGroups(vocabulary, [])).toEqual(new Set());
  });

  it("halal hides the pork family and nothing else", () => {
    expect([...hiddenGroups(vocabulary, excludeTerms({ limits: ["halal"], limits_other: [] }))].sort()).toEqual(familyGroups("pork").sort());
    expect(families(["halal"])).toEqual(expect.arrayContaining(["poultry", "beef", "lamb"]));
    expect(families(["halal"])).not.toContain("pork");
  });

  it("vegetarian hides every flesh family and chicken broth", () => {
    const f = families(["vegetarian"]);
    for (const x of ["poultry", "beef", "pork", "lamb", "fish", "shellfish"]) expect(f).not.toContain(x);
    expect(f).toEqual(expect.arrayContaining(["eggs", "dairy", "legumes", "soy"]));
  });

  it("no dairy hides dairy and milk-tagged groups but keeps coconut and soy milk", () => {
    const hidden = hiddenGroups(vocabulary, excludeTerms({ limits: ["no_dairy"], limits_other: [] }));
    expect(hidden.has("cheese")).toBe(true);
    expect(hidden.has("margarine")).toBe(true);
    expect(hidden.has("coconut_milk")).toBe(false);
    expect(hidden.has("soy_milk")).toBe(false);
  });

  it("search leaves hidden groups out too", () => {
    const ex = excludeTerms({ limits: ["vegetarian"], limits_other: [] });
    expect(search(vocabulary, "chick", ex).groups.map((g) => g.id)).toEqual(["chickpeas"]);
  });
});

describe("mock data", () => {
  it("every mock card passes the real validator", () => {
    const { input, diet } = buildConstraints(profile, session);
    for (const card of MOCK_CARDS) {
      const r = validateCard(card, { input, groups: vocabulary.groupList(diet) });
      expect(r.ok ? [] : r.errors).toEqual([]);
    }
  });

  it("stand-in pricing: needed first, completes while they fit, over shown", () => {
    const salmon = MOCK_CARDS.find((c) => c.name.startsWith("Salmon"))!;
    expect(mockPrice(salmon, 10)).toMatchObject({ over_by: expect.any(Number) });
    expect(mockPrice(salmon, 10).over_by).toBeGreaterThan(0);
    const fish = MOCK_CARDS[0]!;
    const roomy = mockPrice(fish, 50);
    expect(roomy.to_complete).toEqual([]);
    expect(roomy.buy.map((b) => b.role)).toEqual(["needed", "needed", "completes"]);
  });

  it("stand-in sort: fits, then to complete, then over (least over first)", () => {
    const priced: PricedCard[] = MOCK_CARDS.map((card) => ({ card, pricing: mockPrice(card, 12) }));
    const order = mockSort(priced, null).map((p) => badgeFor(p.pricing).status);
    const rank = { fits: 0, complete: 1, over: 2 };
    expect(order.map((s) => rank[s])).toEqual([...order.map((s) => rank[s])].sort());
    const overs = mockSort(priced, null).filter((p) => p.pricing.over_by > 0).map((p) => p.pricing.over_by);
    expect(overs).toEqual([...overs].sort((a, b) => a - b));
  });

  it("reports the four stages in order, once each", async () => {
    const seen: string[] = [];
    await mockDeckSource(0).deal(profile, session, { onStage: (s) => seen.push(s) });
    expect(seen).toEqual(["reading", "building", "pricing", "sorting"]);
  });

  it("a new deck avoids passed dishes", async () => {
    const src = mockDeckSource(0);
    const first = await src.deal(profile, session);
    const second = await src.deal(profile, { ...session, avoid: first.map((p) => p.card.name) });
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    expect(second.map((p) => p.card.name).some((n) => first.map((p) => p.card.name).includes(n))).toBe(false);
  });
});
