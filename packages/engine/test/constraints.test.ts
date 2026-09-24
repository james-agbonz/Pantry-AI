import { validateCard, type Card } from "@pantry/contract";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { buildConstraints, LIMIT_TERMS, type Profile, type Session } from "../src";

const profile: Profile = {
  goal: "eat_well",
  condition: null,
  limits: [],
  limits_other: [],
  appliances: ["stove", "microwave", "fridge"],
  servings: 1,
  targets: { kcal: 2400, protein: 140 },
};

const session: Session = { have: ["rice", "corn"], have_other: ["leftover chili"], budget: 15, avoid: [] };

const excludeFor = (limits: Profile["limits"], limits_other: string[] = []) =>
  buildConstraints({ ...profile, limits, limits_other }, session).input.exclude;

describe("buildConstraints", () => {
  it("builds the SPEC §5 input shape", () => {
    const { input, diet } = buildConstraints(profile, session);
    expect(input).toEqual({
      have: [{ group: "rice" }, { group: "corn" }],
      have_other: ["leftover chili"],
      budget: 15,
      goal: "eat_well",
      condition: null,
      exclude: [],
      methods: ["stove", "microwave", "fridge"],
      targets: { kcal: 2400, protein: 140 },
      servings: 1,
      deck: 6,
      avoid: [],
    });
    expect(diet).toEqual({ halal: false });
  });

  it("maps hard limits to the SPEC §7 terms", () => {
    expect(excludeFor(["no_pork"])).toEqual(["pork"]);
    expect(excludeFor(["no_dairy"])).toEqual(["dairy", "milk"]);
    expect(excludeFor(["nuts"])).toEqual(["nuts", "peanuts", "tree_nuts"]);
    expect(excludeFor(["gluten"])).toEqual(["gluten"]);
  });

  it("expands vegetarian into every flesh family plus flesh words", () => {
    const ex = excludeFor(["vegetarian"]);
    expect(ex).toEqual(expect.arrayContaining(["poultry", "beef", "pork", "lamb", "fish", "shellfish", "chicken", "gelatin"]));
  });

  it("sets halal on the diet and keeps pork, gelatin and alcohol out of the text", () => {
    const { input, diet } = buildConstraints({ ...profile, limits: ["halal"] }, session);
    expect(diet).toEqual({ halal: true });
    expect(input.exclude).toEqual(expect.arrayContaining(["pork", "lard", "gelatin", "alcohol", "wine"]));
  });

  it("adds free-text limits as typed, without duplicates", () => {
    expect(excludeFor(["no_pork", "halal", "vegetarian"], ["Cilantro", "PORK", "cilantro"])).toEqual(
      expect.arrayContaining(["pork", "Cilantro"]),
    );
    const ex = excludeFor(["no_pork", "halal", "vegetarian"], ["Cilantro", "PORK", "cilantro"]);
    expect(ex.filter((t) => t.toLowerCase() === "pork")).toHaveLength(1);
    expect(ex.filter((t) => t.toLowerCase() === "cilantro")).toHaveLength(1);
  });

  it("passes null targets through", () => {
    expect(buildConstraints({ ...profile, targets: null }, session).input.targets).toBeNull();
  });

  it("rejects a condition without the condition goal, and the reverse", () => {
    expect(() => buildConstraints({ ...profile, condition: "kidney" }, session)).toThrow();
    expect(() => buildConstraints({ ...profile, goal: "condition" }, session)).toThrow();
    expect(buildConstraints({ ...profile, goal: "condition", condition: "kidney" }, session).input.condition).toBe("kidney");
  });

  it("rejects an unknown limit or appliance", () => {
    expect(() => buildConstraints({ ...profile, limits: ["keto" as never] }, session)).toThrow();
    expect(() => buildConstraints({ ...profile, appliances: ["campfire" as never] }, session)).toThrow();
  });

  it("has a term list for every limit", () => {
    for (const terms of Object.values(LIMIT_TERMS)) expect(terms.length).toBeGreaterThan(0);
  });
});

describe("with the real vocabulary", () => {
  const card: Card = {
    id: "",
    name: "Bean and corn rice",
    time_min: 15,
    kcal: 500,
    protein_g: 20,
    uses: ["rice", "corn"],
    missing: [{ group: "black_beans", qty: "1 can", role: "needed" }],
    methods: ["stove"],
    steps: ["Warm everything together."],
    image_prompt: "Beans and rice in a bowl",
  };

  const check = (limits: Profile["limits"], c: Card) => {
    const { input, diet } = buildConstraints({ ...profile, limits }, session);
    return validateCard(c, { input, groups: vocabulary.groupList(diet) });
  };

  it("vegetarian fails chicken broth by family and chicken in a step by word", () => {
    expect(check(["vegetarian"], card).ok).toBe(true);
    expect(check(["vegetarian"], { ...card, missing: [{ group: "chicken_broth", qty: "1 cup", role: "completes" }] }).ok).toBe(false);
    expect(check(["vegetarian"], { ...card, steps: ["Add leftover chicken if you have it."] }).ok).toBe(false);
    expect(check(["vegetarian"], { ...card, missing: [{ group: "canned_tuna", qty: "1 can", role: "needed" }] }).ok).toBe(false);
  });

  it("vegetarian still allows eggs, dairy and chickpeas", () => {
    const veg = { ...card, missing: [{ group: "eggs", qty: "2", role: "needed" as const }, { group: "cheese", qty: "30g", role: "completes" as const }, { group: "chickpeas", qty: "1 can", role: "needed" as const }] };
    expect(check(["vegetarian"], veg).ok).toBe(true);
  });

  it("halal drops meat groups with no halal item, keeps those with one", () => {
    const { diet } = buildConstraints({ ...profile, limits: ["halal"] }, session);
    const ids = vocabulary.groupList(diet).map((g) => g.group);
    expect(ids).not.toContain("bacon");
    expect(ids).not.toContain("ham");
    expect(ids).toContain("chicken_thighs");
    expect(check(["halal"], { ...card, missing: [{ group: "ham", qty: "100g", role: "needed" }] }).ok).toBe(false);
  });
});
