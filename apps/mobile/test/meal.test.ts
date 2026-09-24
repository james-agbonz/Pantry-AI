import type { Profile } from "@pantry/contract";
import { computeTargets } from "@pantry/needs";
import { describe, expect, it } from "vitest";
import { EMPTY_FORM, needsBodyStats, readStats, switchUnits } from "../src/meal/bodyStats";
import { logMeal, todayTotals } from "../src/meal/log";
import { shoppingList } from "../src/meal/shopping";
import { MOCK_CARDS } from "../src/mock/deck";
import { vocabulary } from "@pantry/vocabulary";
import { tablePricer } from "../src/data/pricer";

const mockPricer = (diet: { halal: boolean }) => tablePricer(vocabulary, diet);

const fish = MOCK_CARDS[0]!;
const pricer = mockPricer({ halal: false });

describe("shopping list", () => {
  it("lists what to buy with ~prices, then what completes it, and says prices are typical", () => {
    const p = pricer.price(fish, 10);
    const text = shoppingList(fish, p);
    expect(text.split("\n")[0]).toBe(fish.name);
    expect(text).toContain(`Buy (~$${p.total.toFixed(2)} of $10):`);
    for (const b of p.buy) expect(text).toContain(`- ${b.item}, ${b.unit}: ~$${b.price.toFixed(2)}`);
    expect(p.to_complete.length).toBeGreaterThan(0);
    expect(text).toContain(`To complete (+~$${p.complete_cost.toFixed(2)}):`);
    // The shipped table is placeholder, so the list must not call these prices typical.
    expect(text.trimEnd().endsWith("Sample prices for testing, not real.")).toBe(true);
    expect(text).not.toContain("typical");
    // Every estimate carries ~; the only bare figure is the budget the user typed.
    expect(text.match(/(?<!~)\$\d+(\.\d+)?/g)).toEqual(["$10"]);
  });

  it("states over budget plainly", () => {
    const salmon = MOCK_CARDS.find((c) => c.name.startsWith("Salmon"))!;
    expect(shoppingList(salmon, pricer.price(salmon, 5))).toMatch(/Over by ~\$\d+\.\d\d/);
  });
});

describe("swapping an item", () => {
  it("offers the group's items cheapest first, and the total follows the pick", () => {
    const opts = pricer.options("white_fish");
    expect(opts.length).toBeGreaterThan(1);
    expect(opts.map((o) => o.price)).toEqual([...opts.map((o) => o.price)].sort((a, b) => a - b));
    const cheapest = pricer.price(fish, 50);
    const swapped = pricer.price(fish, 50, { white_fish: opts.at(-1)!.id });
    expect(swapped.total).toBeCloseTo(cheapest.total + opts.at(-1)!.price - opts[0]!.price, 2);
    expect(opts.at(-1)!.price).toBeGreaterThan(opts[0]!.price);
    expect(swapped.buy.find((b) => b.group === "white_fish")?.item).toBe(opts.at(-1)!.name);
  });

  it("under halal, meat groups offer halal items only", () => {
    const all = mockPricer({ halal: false }).options("chicken_thighs");
    const halal = mockPricer({ halal: true }).options("chicken_thighs");
    expect(halal.length).toBeGreaterThan(0);
    expect(halal.length).toBeLessThan(all.length);
    expect(halal.every((o) => /halal/i.test(o.name))).toBe(true);
  });
});

describe("today's log", () => {
  const meal = { id: "a", name: "Fish", kcal: 610, protein_g: 42 };
  it("adds up today's meals, once each, and starts fresh on a new day", () => {
    let log = logMeal(null, meal, "2026-09-24");
    log = logMeal(log, meal, "2026-09-24");
    log = logMeal(log, { ...meal, id: "b", kcal: 500, protein_g: 20 }, "2026-09-24");
    expect(todayTotals(log, "2026-09-24")).toEqual({ kcal: 1110, protein_g: 62, meals: 2 });
    expect(todayTotals(log, "2026-09-25")).toEqual({ kcal: 0, protein_g: 0, meals: 0 });
    expect(logMeal(log, meal, "2026-09-25").meals).toHaveLength(1);
  });
});

describe("body stats", () => {
  const base: Profile = { goal: "cut", condition: null, limits: [], limits_other: [], appliances: [], servings: 1, targets: null };

  it("are asked for cut, bulk and condition until targets exist; never for eat well", () => {
    expect(needsBodyStats(base)).toBe(true);
    expect(needsBodyStats({ ...base, goal: "bulk" })).toBe(true);
    expect(needsBodyStats({ ...base, goal: "condition", condition: "kidney" })).toBe(true);
    expect(needsBodyStats({ ...base, goal: "eat_well" })).toBe(false);
    expect(needsBodyStats({ ...base, targets: { kcal: 2000, protein: 120 } })).toBe(false);
  });

  const filled = { ...EMPTY_FORM, height_cm: "180", weight_kg: "80", age: "30", sex: "male" as const, activity: "moderate" as const };

  it("everything but target weight is required, and the first gap is named", () => {
    expect(readStats(EMPTY_FORM)).toEqual({ ok: false, fix: "Enter your height in cm" });
    expect(readStats({ ...filled, age: "" })).toEqual({ ok: false, fix: "Enter your age in whole years" });
    expect(readStats({ ...filled, sex: null })).toEqual({ ok: false, fix: "Choose an answer for sex" });
    expect(readStats({ ...filled, activity: null })).toEqual({ ok: false, fix: "Choose how active you are" });
    expect(readStats(filled)).toMatchObject({ ok: true, stats: { target_kg: null } });
  });

  it("names out-of-range numbers with the range, in the units on screen", () => {
    expect(readStats({ ...filled, height_cm: "18" })).toEqual({ ok: false, fix: "Height should be between 100 and 250 cm" });
    expect(readStats({ ...filled, weight_kg: "800" })).toEqual({ ok: false, fix: "Weight should be between 30 and 300 kg" });
    expect(readStats({ ...filled, age: "12" })).toEqual({ ok: false, fix: "Age should be between 16 and 110" });
    expect(readStats({ ...filled, age: "30.5" })).toEqual({ ok: false, fix: "Enter your age in whole years" });
    expect(readStats({ ...filled, target_kg: "7" })).toEqual({ ok: false, fix: "Target weight should be between 30 and 300 kg, or left blank" });
  });

  it("accepts a comma decimal, and 'Prefer not to say' is skipped sex", () => {
    expect(readStats({ ...filled, weight_kg: "80,5" })).toMatchObject({ ok: true, stats: { weight_kg: 80.5 } });
    expect(readStats({ ...filled, sex: "skip" })).toMatchObject({ ok: true, stats: { sex: null } });
  });

  describe("feet, inches and pounds", () => {
    const imp = { ...EMPTY_FORM, units: "imperial" as const, height_ft: "5", height_in: "11", weight_lb: "176", age: "30", sex: "male" as const, activity: "moderate" as const };

    it("store metric", () => {
      expect(readStats(imp)).toMatchObject({ ok: true, stats: { height_cm: 180.3, weight_kg: 79.8 } });
      expect(readStats({ ...imp, height_in: "" })).toMatchObject({ ok: true, stats: { height_cm: 152.4 } });
    });

    it("name the problem in feet and pounds", () => {
      expect(readStats({ ...imp, height_ft: "" })).toEqual({ ok: false, fix: "Enter your height in feet and inches" });
      expect(readStats({ ...imp, height_in: "14" })).toEqual({ ok: false, fix: "Inches should be 0 to 11" });
      expect(readStats({ ...imp, height_ft: "2" })).toEqual({ ok: false, fix: "Height should be between 3 ft 3 in and 8 ft 2 in" });
      expect(readStats({ ...imp, weight_lb: "20" })).toEqual({ ok: false, fix: "Weight should be between 67 and 661 lb" });
      expect(readStats({ ...imp, weight_lb: "" })).toEqual({ ok: false, fix: "Enter your weight in lb" });
    });

    it("switching units converts what's typed, both ways", () => {
      const toImp = switchUnits({ ...filled, target_kg: "70" }, "imperial");
      expect(toImp).toMatchObject({ units: "imperial", height_ft: "5", height_in: "11", weight_lb: "176", target_lb: "154" });
      const back = switchUnits(toImp, "metric");
      expect(back).toMatchObject({ units: "metric", height_cm: "180", weight_kg: "79.8", target_kg: "69.9" });
      expect(switchUnits(EMPTY_FORM, "imperial")).toMatchObject({ height_ft: "", weight_lb: "" });
    });
  });

  it("feed the needs calculator: a cut with a lower target uses target weight for protein", () => {
    const r = readStats({ ...filled, target_kg: "70" });
    if (!r.ok) throw new Error(r.fix);
    expect(computeTargets({ goal: "cut", condition: null, stats: r.stats })).toEqual({ kcal: 2345, protein: 126 });
  });
});
