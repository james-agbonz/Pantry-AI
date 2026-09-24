import { describe, expect, it } from "vitest";
import { Card, EngineInput, validateCard, validateDeck, type GroupRef, type ValidateContext } from "../src";

// Test fixtures only — the real list comes from the vocabulary (build step 2).
const groups: GroupRef[] = [
  { group: "rice", family: "grains", contains: [] },
  { group: "corn", family: "vegetables", contains: [] },
  { group: "white_fish", family: "fish", contains: ["fish"] },
  { group: "frozen_veg", family: "vegetables", contains: [] },
  { group: "bacon", family: "pork", contains: [] },
  { group: "cheese", family: "dairy", contains: ["milk"] },
  { group: "seasoning", family: "pantry", contains: ["mustard"] },
  { group: "soy_sauce", family: "soy", contains: ["soy", "wheat", "gluten"] },
  { group: "rice_noodles", family: "grains", contains: [] },
];

const input: EngineInput = {
  have: [{ group: "rice" }, { group: "corn" }],
  have_other: ["leftover chili"],
  budget: 15,
  goal: "eat_well",
  condition: null,
  exclude: ["pork", "nuts"],
  methods: ["stove", "microwave", "fridge"],
  targets: { kcal: 2400, protein: 140 },
  servings: 1,
  deck: 6,
  avoid: [],
};

const ctx: ValidateContext = { input, groups };

const good: Card = {
  id: "c1",
  name: "Fish and corn rice bowl",
  time_min: 25,
  kcal: 560,
  protein_g: 38,
  uses: ["rice", "corn"],
  missing: [
    { group: "white_fish", qty: "300g", role: "needed" },
    { group: "frozen_veg", qty: "1 cup", role: "completes" },
  ],
  methods: ["stove"],
  steps: ["Cook the rice.", "Pan-fry the fish.", "Serve over rice with corn."],
  image_prompt: "Home-cooked rice bowl with white fish and corn on a plain plate, kitchen light",
};

const codes = (r: ReturnType<typeof validateCard>) => (r.ok ? [] : r.errors.map((e) => e.code));

describe("EngineInput", () => {
  it("accepts the SPEC example", () => {
    expect(EngineInput.safeParse(input).success).toBe(true);
  });

  it("accepts null targets", () => {
    expect(EngineInput.safeParse({ ...input, targets: null }).success).toBe(true);
  });

  it("requires a condition only when goal is condition", () => {
    expect(EngineInput.safeParse({ ...input, goal: "condition", condition: "kidney" }).success).toBe(true);
    expect(EngineInput.safeParse({ ...input, goal: "condition", condition: null }).success).toBe(false);
    expect(EngineInput.safeParse({ ...input, goal: "cut", condition: "kidney" }).success).toBe(false);
  });

  it("rejects unknown methods, negative budgets and extra keys", () => {
    expect(EngineInput.safeParse({ ...input, methods: ["campfire"] }).success).toBe(false);
    expect(EngineInput.safeParse({ ...input, budget: -1 }).success).toBe(false);
    expect(EngineInput.safeParse({ ...input, prices: {} }).success).toBe(false);
  });
});

describe("validateCard", () => {
  it("passes a good card, as an object or a JSON string", () => {
    expect(validateCard(good, ctx)).toEqual({ ok: true, card: good });
    expect(validateCard(JSON.stringify(good), ctx).ok).toBe(true);
  });

  it("fails invalid JSON", () => {
    expect(codes(validateCard("{ not json", ctx))).toEqual(["invalid_json"]);
  });

  it("fails a card that states a price", () => {
    const r = validateCard({ ...good, missing: [{ ...good.missing[0], price: 6.49 }] }, ctx);
    expect(codes(r)).toEqual(["invalid_shape"]);
    expect(codes(validateCard({ ...good, price: 13.49 }, ctx))).toEqual(["invalid_shape"]);
  });

  it("fails a bad role or missing fields", () => {
    expect(codes(validateCard({ ...good, missing: [{ group: "rice", qty: "1", role: "optional" }] }, ctx))).toContain("invalid_shape");
    const { steps: _, ...noSteps } = good;
    expect(codes(validateCard(noSteps, ctx))).toContain("invalid_shape");
  });

  it("fails an unknown group", () => {
    const r = validateCard({ ...good, missing: [{ group: "unicorn", qty: "1", role: "needed" }] }, ctx);
    expect(r.ok ? [] : r.errors).toEqual([expect.objectContaining({ code: "unknown_group", path: "missing.0.group" })]);
  });

  it("allows have_other free text in uses", () => {
    expect(validateCard({ ...good, uses: ["rice", "Leftover Chili"] }, ctx).ok).toBe(true);
    expect(codes(validateCard({ ...good, uses: ["rice", "mystery"] }, ctx))).toEqual(["unknown_group"]);
  });

  it("fails a method the user doesn't have", () => {
    const r = validateCard({ ...good, methods: ["stove", "oven"] }, ctx);
    expect(r.ok ? [] : r.errors).toEqual([expect.objectContaining({ code: "method_not_allowed", path: "methods.1" })]);
  });

  it("allows a no-cook dish", () => {
    expect(validateCard({ ...good, methods: [] }, ctx).ok).toBe(true);
  });

  describe("exclude", () => {
    it("fails a group whose family is excluded", () => {
      const r = validateCard({ ...good, missing: [{ group: "bacon", qty: "4 strips", role: "needed" }] }, ctx);
      expect(codes(r)).toContain("excluded_ingredient");
    });

    it("fails an excluded family by name, e.g. dairy → cheese", () => {
      const c = { ...ctx, input: { ...input, exclude: ["dairy"] } };
      expect(codes(validateCard({ ...good, missing: [{ group: "cheese", qty: "1 block", role: "completes" }] }, c))).toContain(
        "excluded_ingredient",
      );
    });

    it("fails a group whose contains tags hit an exclude, e.g. gluten → soy sauce", () => {
      const c = { ...ctx, input: { ...input, exclude: ["gluten"] } };
      const r = validateCard({ ...good, missing: [{ group: "soy_sauce", qty: "2 tbsp", role: "needed" }] }, c);
      expect(r.ok ? [] : r.errors).toEqual([expect.objectContaining({ code: "excluded_ingredient", path: "missing.0.group" })]);
      expect(validateCard({ ...good, missing: [{ group: "rice_noodles", qty: "200g", role: "needed" }] }, c).ok).toBe(true);
    });

    it("matches multi-word tags however the exclude is written", () => {
      const g = [...groups, { group: "almonds", family: "nuts", contains: ["tree_nuts"] }];
      const c = { input: { ...input, exclude: ["Tree nuts"] }, groups: g };
      expect(codes(validateCard({ ...good, missing: [{ group: "almonds", qty: "30g", role: "completes" }] }, c))).toContain(
        "excluded_ingredient",
      );
    });

    it("fails an excluded word anywhere in the text", () => {
      expect(codes(validateCard({ ...good, name: "Pork fried rice" }, ctx))).toEqual(["excluded_ingredient"]);
      expect(codes(validateCard({ ...good, steps: [...good.steps, "Top with crushed nuts."] }, ctx))).toEqual(["excluded_ingredient"]);
      expect(codes(validateCard({ ...good, image_prompt: "rice with a walnut crumble" }, { ...ctx, input: { ...input, exclude: ["walnuts"] } }))).toEqual([
        "excluded_ingredient",
      ]);
    });

    it("matches singular and plural, and multi-word terms", () => {
      const c = (exclude: string[]) => ({ ...ctx, input: { ...input, exclude } });
      expect(validateCard({ ...good, name: "Rice with a nut sauce" }, ctx).ok).toBe(false);
      expect(validateCard({ ...good, name: "Cheeses on rice" }, c(["cheese"])).ok).toBe(false);
      expect(validateCard({ ...good, name: "Cheese on rice" }, c(["cheeses"])).ok).toBe(false);
      expect(validateCard(good, c(["white fish"])).ok).toBe(false);
      expect(validateCard(good, c(["White-Fish"])).ok).toBe(false);
    });

    it("does not match inside other words", () => {
      const c = { ...ctx, input: { ...input, exclude: ["egg"] } };
      expect(validateCard({ ...good, name: "Eggplant rice" }, c).ok).toBe(true);
      expect(validateCard({ ...good, name: "Porky rice" }, ctx).ok).toBe(true);
    });

    it("passes when nothing is excluded", () => {
      expect(validateCard({ ...good, name: "Pork rice" }, { ...ctx, input: { ...input, exclude: [] } }).ok).toBe(true);
    });
  });
});

describe("validateDeck", () => {
  it("returns passing cards and the index of each failing card", () => {
    const deck = [good, { ...good, id: "c2", methods: ["oven"] }, { ...good, id: "c3" }];
    const r = validateDeck(JSON.stringify(deck), ctx, 3);
    expect(r.cards.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(r.failed).toEqual([{ index: 1, errors: [expect.objectContaining({ code: "method_not_allowed" })] }]);
  });

  it("reports short decks as missing cards", () => {
    const r = validateDeck([good], ctx, 3);
    expect(r.failed.map((f) => f.index)).toEqual([1, 2]);
  });

  it("fails every slot when the deck is not valid JSON or not an array", () => {
    expect(validateDeck("nope", ctx, 6).failed).toHaveLength(6);
    expect(validateDeck({ cards: [] }, ctx, 6).failed).toHaveLength(6);
  });
});
