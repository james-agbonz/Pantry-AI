import { describe, expect, it } from "vitest";
import { baseline, computeTargets, type BodyStats } from "../src";

// Worked by hand from SPEC §8.
const man: BodyStats = { height_cm: 180, weight_kg: 80, age: 30, sex: "male", activity: "moderate" };
// 10·80 + 6.25·180 − 5·30 + 5 = 1780; × 1.55 = 2759
const woman: BodyStats = { height_cm: 165, weight_kg: 60, age: 30, sex: "female", activity: "light" };
// 10·60 + 6.25·165 − 5·30 − 161 = 1320.25; × 1.375 = 1815.34

const eatWell = { goal: "eat_well" as const, condition: null };

describe("baseline (Mifflin-St Jeor)", () => {
  it("uses the men's and women's formulas", () => {
    expect(baseline(man)).toBe(1780);
    expect(baseline(woman)).toBe(1320.25);
  });

  it("averages the two for other or skipped sex", () => {
    const avg = (baseline({ ...man, sex: "male" }) + baseline({ ...man, sex: "female" })) / 2;
    expect(baseline({ ...man, sex: "other" })).toBe(avg);
    expect(baseline({ ...man, sex: null })).toBe(avg);
  });
});

describe("computeTargets", () => {
  it("returns null without body stats", () => {
    expect(computeTargets({ ...eatWell, stats: null })).toBeNull();
    expect(computeTargets({ goal: "cut", condition: null, stats: null })).toBeNull();
  });

  it("applies the activity factors", () => {
    const kcal = (activity: BodyStats["activity"]) => computeTargets({ ...eatWell, stats: { ...man, activity } })!.kcal;
    expect([kcal("sedentary"), kcal("light"), kcal("moderate"), kcal("very_active")]).toEqual([2136, 2448, 2759, 3071]);
  });

  it("eat well: maintenance, 1.0 g/kg", () => {
    expect(computeTargets({ ...eatWell, stats: man })).toEqual({ kcal: 2759, protein: 80 });
    expect(computeTargets({ ...eatWell, stats: woman })).toEqual({ kcal: 1815, protein: 60 });
  });

  it("cut: −15%, 1.8 g/kg", () => {
    expect(computeTargets({ goal: "cut", condition: null, stats: man })).toEqual({ kcal: 2345, protein: 144 });
    expect(computeTargets({ goal: "cut", condition: null, stats: woman })).toEqual({ kcal: 1543, protein: 108 });
  });

  it("bulk: +10%, 1.8 g/kg", () => {
    expect(computeTargets({ goal: "bulk", condition: null, stats: man })).toEqual({ kcal: 3035, protein: 144 });
  });

  describe("cut floor", () => {
    it("never below 1500 for men", () => {
      // 10·55 + 6.25·160 − 5·70 + 5 = 1205; × 1.2 = 1446; × 0.85 = 1229
      const stats: BodyStats = { height_cm: 160, weight_kg: 55, age: 70, sex: "male", activity: "sedentary" };
      expect(computeTargets({ goal: "cut", condition: null, stats })!.kcal).toBe(1500);
    });

    it("never below 1200 for women", () => {
      // 10·50 + 6.25·150 − 5·60 − 161 = 976.5; × 1.2 = 1171.8; × 0.85 = 996
      const stats: BodyStats = { height_cm: 150, weight_kg: 50, age: 60, sex: "female", activity: "sedentary" };
      expect(computeTargets({ goal: "cut", condition: null, stats })!.kcal).toBe(1200);
    });

    it("never below 1350, the average, for other or skipped sex", () => {
      const stats: BodyStats = { height_cm: 150, weight_kg: 50, age: 60, sex: null, activity: "sedentary" };
      expect(computeTargets({ goal: "cut", condition: null, stats })!.kcal).toBe(1350);
      expect(computeTargets({ goal: "cut", condition: null, stats: { ...stats, sex: "other" } })!.kcal).toBe(1350);
    });

    it("applies only to cut", () => {
      const stats: BodyStats = { height_cm: 150, weight_kg: 50, age: 60, sex: "female", activity: "sedentary" };
      expect(computeTargets({ ...eatWell, stats })!.kcal).toBe(1172);
    });
  });

  describe("condition", () => {
    it("eats like Eat well: maintenance, 1.0 g/kg", () => {
      for (const condition of ["diabetes", "blood_pressure", "anemia", "other"] as const) {
        expect(computeTargets({ goal: "condition", condition, stats: man })).toEqual({ kcal: 2759, protein: 80 });
      }
    });

    it("kidney: ~0.8 g/kg protein, overriding the goal", () => {
      expect(computeTargets({ goal: "condition", condition: "kidney", stats: man })).toEqual({ kcal: 2759, protein: 64 });
    });
  });

  it("rejects impossible stats", () => {
    expect(() => computeTargets({ ...eatWell, stats: { ...man, weight_kg: -80 } })).toThrow();
    expect(() => computeTargets({ ...eatWell, stats: { ...man, age: 30.5 } })).toThrow();
    expect(() => computeTargets({ ...eatWell, stats: { ...man, activity: "athlete" as never } })).toThrow();
  });
});
