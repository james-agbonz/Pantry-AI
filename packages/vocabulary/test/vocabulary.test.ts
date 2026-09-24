import { validateCard, type Card, type EngineInput } from "@pantry/contract";
import { describe, expect, it } from "vitest";
import { loadVocabulary, MEAT_FAMILIES, NO_DIET, vocabulary as v } from "../src";

const HALAL = { halal: true };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const groupIds = (diet = NO_DIET) => v.groupList(diet).map((g) => g.group);

describe("shipped data", () => {
  it("is 150–200 items", () => {
    expect(v.items.length).toBeGreaterThanOrEqual(150);
    expect(v.items.length).toBeLessThanOrEqual(200);
  });

  it("has the groups the SPEC examples use", () => {
    for (const g of ["rice", "corn", "white_fish", "frozen_veg", "salmon", "seasoning"]) {
      expect(groupIds()).toContain(g);
    }
    expect(v.items.find((i) => i.id === "basa_frozen")).toMatchObject({
      family: "fish",
      group: "white_fish",
      name: "Basa fillets, frozen",
      unit: "400g",
    });
  });

  it("has no real prices yet (build step 2: price column empty)", () => {
    for (const item of v.items) {
      expect(item).toMatchObject({ price: null, price_source: "placeholder", updated: null });
    }
  });

  it("puts nuts and nut butters in the nuts family", () => {
    const nuts = v.groups.filter((g) => g.family === "nuts").map((g) => g.id);
    expect(nuts).toEqual(expect.arrayContaining(["peanut_butter", "almond_butter", "peanuts", "almonds", "mixed_nuts"]));
    // Nothing nut-like hiding elsewhere.
    const stray = v.items.filter((i) => i.family !== "nuts" && /\b(peanut|almond|cashew|walnut|pecan|hazelnut|pistachio|nut)s?\b/i.test(i.name));
    expect(stray).toEqual([]);
  });

  it("flags every meat item halal or not, and nothing else", () => {
    for (const item of v.items) {
      if (MEAT_FAMILIES.includes(item.family)) expect(typeof item.halal).toBe("boolean");
      else expect(item.halal).toBeUndefined();
    }
  });
});

describe("allergen tags", () => {
  const tags = (id: string) => v.groups.find((g) => g.id === id)?.contains;

  it("are set deliberately, not by name", () => {
    expect(tags("rice_noodles")).toEqual([]);
    expect(tags("soy_sauce")).toEqual(expect.arrayContaining(["soy", "wheat", "gluten"]));
    expect(tags("oats")).toEqual(["gluten"]);
    expect(tags("barley")).toEqual(["gluten"]);
    expect(tags("egg_noodles")).toEqual(expect.arrayContaining(["eggs", "wheat", "gluten"]));
    expect(tags("mayonnaise")).toContain("eggs");
    expect(tags("margarine")).toContain("milk");
    expect(tags("shrimp")).toContain("shellfish");
  });

  it("tag every wheat group with gluten too", () => {
    for (const g of v.groups.filter((g) => g.contains.includes("wheat"))) expect(g.contains).toContain("gluten");
  });

  it("agree with the family where the family is itself an allergen", () => {
    const expected: Record<string, string[]> = { dairy: ["milk"], eggs: ["eggs"], fish: ["fish"], shellfish: ["shellfish"], soy: ["soy"] };
    for (const g of v.groups) {
      for (const tag of expected[g.family] ?? []) expect(g.contains, g.id).toContain(tag);
    }
    for (const g of v.groups.filter((g) => g.family === "nuts")) {
      expect(g.contains.some((t) => t === "peanuts" || t === "tree_nuts"), g.id).toBe(true);
    }
  });

  it("reach the validator through groupList", () => {
    const input = { exclude: ["gluten"], methods: [], have_other: [] };
    const card = (group: string): Card => ({
      id: "",
      name: "Noodle bowl",
      time_min: 15,
      kcal: 500,
      protein_g: 20,
      uses: [],
      missing: [{ group, qty: "1", role: "needed" }],
      methods: [],
      steps: ["Assemble."],
      image_prompt: "",
    });
    expect(validateCard(card("rice_noodles"), { input, groups: v.groupList() }).ok).toBe(true);
    expect(validateCard(card("soy_sauce"), { input, groups: v.groupList() }).ok).toBe(false);
    expect(validateCard(card("oats"), { input, groups: v.groupList() }).ok).toBe(false);
  });
});

describe("halal diet", () => {
  it("resolves meat groups to halal-certified items only", () => {
    expect(ids(v.itemsFor("chicken_thighs")).length).toBeGreaterThan(1);
    expect(ids(v.itemsFor("chicken_thighs", HALAL))).toEqual(["chicken_thighs_halal_1kg"]);
    expect(ids(v.itemsFor("ground_beef", HALAL))).toEqual(["ground_beef_halal_454g"]);
  });

  it("leaves non-meat groups alone", () => {
    expect(v.itemsFor("white_fish", HALAL)).toEqual(v.itemsFor("white_fish"));
    expect(v.itemsFor("rice", HALAL)).toEqual(v.itemsFor("rice"));
  });

  it("drops groups with no halal item, including all pork", () => {
    const halal = groupIds(HALAL);
    for (const g of v.groups.filter((g) => g.family === "pork")) expect(halal).not.toContain(g.id);
    expect(halal).not.toContain("ground_chicken");
    expect(halal).toContain("chicken_breast");
    expect(halal).toContain("rice");
  });

  it("makes validateCard reject a halal card that needs a non-halal group", () => {
    const input: Pick<EngineInput, "exclude" | "methods" | "have_other"> = { exclude: ["pork"], methods: ["stove"], have_other: [] };
    const card: Card = {
      id: "",
      name: "Chicken rice",
      time_min: 30,
      kcal: 600,
      protein_g: 40,
      uses: ["rice"],
      missing: [{ group: "ground_chicken", qty: "450g", role: "needed" }],
      methods: ["stove"],
      steps: ["Cook."],
      image_prompt: "",
    };
    expect(validateCard(card, { input, groups: v.groupList() }).ok).toBe(true);
    const r = validateCard(card, { input, groups: v.groupList(HALAL) });
    expect(r.ok ? [] : r.errors.map((e) => e.code)).toEqual(["unknown_group"]);
  });
});

describe("exclude by family", () => {
  it("catches peanut butter when nuts are excluded", () => {
    const input = { exclude: ["nuts"], methods: [], have_other: [] };
    const card: Card = {
      id: "",
      name: "Satay noodles",
      time_min: 15,
      kcal: 550,
      protein_g: 20,
      uses: ["instant_noodles"],
      missing: [{ group: "peanut_butter", qty: "2 tbsp", role: "needed" }],
      methods: [],
      steps: ["Soak the noodles.", "Stir through the sauce."],
      image_prompt: "",
    };
    const r = validateCard(card, { input, groups: v.groupList() });
    expect(r.ok ? [] : r.errors).toContainEqual(expect.objectContaining({ code: "excluded_ingredient", path: "missing.0.group" }));
  });
});

describe("loadVocabulary rejects bad data", () => {
  const base = () => ({
    families: [
      { id: "beef", label: "Beef" },
      { id: "grains", label: "Grains" },
    ],
    groups: [
      { id: "ground_beef", family: "beef", label: "Ground beef", contains: [] as string[] },
      { id: "rice", family: "grains", label: "Rice", contains: [] as string[] },
    ],
    items: [
      { id: "gb", family: "beef", group: "ground_beef", name: "Ground beef", unit: "454g", halal: false, price: null, price_source: "placeholder", updated: null },
      { id: "r", family: "grains", group: "rice", name: "Rice", unit: "900g", price: null, price_source: "placeholder", updated: null },
    ],
  });

  it("accepts good data", () => {
    expect(() => loadVocabulary(base())).not.toThrow();
  });

  const bad: [string, (d: ReturnType<typeof base>) => void][] = [
    ["duplicate item id", (d) => void (d.items[1]!.id = "gb")],
    ["unknown group", (d) => void (d.items[1]!.group = "pasta")],
    ["family mismatch", (d) => void (d.items[1]!.family = "beef")],
    ["meat item without halal flag", (d) => void delete (d.items[0] as { halal?: boolean }).halal],
    ["halal flag on a non-meat item", (d) => void Object.assign(d.items[1]!, { halal: true })],
    ["group with no items", (d) => void d.groups.push({ id: "pasta", family: "grains", label: "Pasta", contains: ["wheat", "gluten"] })],
    ["group without contains", (d) => void delete (d.groups[1] as { contains?: string[] }).contains],
    ["unknown allergen", (d) => void (d.groups[1]!.contains = ["celery"])],
    ["duplicate allergen", (d) => void (d.groups[1]!.contains = ["milk", "milk"])],
    ["unknown family", (d) => void (d.groups[1]!.family = "cereal")],
    ["real price without a date", (d) => void Object.assign(d.items[1]!, { price: 3.49, price_source: "statcan" })],
    ["a price key typo", (d) => void Object.assign(d.items[1]!, { cost: 3.49 })],
  ];
  it.each(bad)("rejects %s", (_, mutate) => {
    const d = base();
    mutate(d);
    expect(() => loadVocabulary(d)).toThrow();
  });

  it("accepts a real price with a date", () => {
    const d = base();
    Object.assign(d.items[1]!, { price: 3.49, price_source: "statcan", updated: "2026-08-01" });
    expect(() => loadVocabulary(d)).not.toThrow();
  });
});
