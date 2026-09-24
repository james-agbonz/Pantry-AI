import type { Profile } from "@pantry/contract";
import { describe, expect, it } from "vitest";
import { reduce } from "../src/onboarding/answers";
import { applySettings, fromProfile, isDirty } from "../src/settings/apply";

const cut: Profile = {
  goal: "cut",
  condition: null,
  limits: ["halal"],
  limits_other: ["cilantro"],
  appliances: ["stove", "fridge"],
  servings: 2,
  targets: { kcal: 2345, protein: 126 },
};

describe("settings", () => {
  it("round-trips the profile unchanged", () => {
    const a = fromProfile(cut);
    expect(isDirty(cut, a)).toBe(false);
    expect(applySettings(cut, a)).toEqual({ profile: cut, targetsCleared: false });
  });

  it("keeps targets when only limits, appliances or servings change", () => {
    let a = reduce(fromProfile(cut), { type: "toggle_limit", limit: "nuts" });
    a = reduce(a, { type: "toggle_appliance", method: "oven" });
    a = reduce(a, { type: "servings", servings: 3 });
    expect(isDirty(cut, a)).toBe(true);
    const r = applySettings(cut, a);
    expect(r.targetsCleared).toBe(false);
    expect(r.profile).toMatchObject({ limits: ["halal", "nuts"], appliances: ["stove", "fridge", "oven"], servings: 3, targets: cut.targets });
  });

  it("clears targets when the goal or condition changes", () => {
    expect(applySettings(cut, reduce(fromProfile(cut), { type: "goal", goal: "bulk" }))).toMatchObject({ profile: { goal: "bulk", targets: null }, targetsCleared: true });
    expect(applySettings(cut, reduce(fromProfile(cut), { type: "goal", goal: "eat_well" })).profile.targets).toBeNull();
    const kidney = { ...cut, goal: "condition" as const, condition: "kidney" as const };
    expect(applySettings(kidney, reduce(fromProfile(kidney), { type: "condition", condition: "anemia" })).targetsCleared).toBe(true);
  });

  it("order of limits and appliances doesn't count as a change", () => {
    expect(isDirty(cut, { ...fromProfile(cut), appliances: ["fridge", "stove"] })).toBe(false);
  });
});
