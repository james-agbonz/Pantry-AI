import { Limit, Method } from "@pantry/contract";
import { describe, expect, it } from "vitest";
import { reduce, START, toProfile, TYPICAL_KITCHEN, type Action, type Answers } from "../src/onboarding/answers";

const run = (...actions: Action[]) => actions.reduce(reduce, START);

describe("onboarding answers", () => {
  it("can't become a profile before a goal is chosen", () => {
    expect(() => toProfile(START)).toThrow();
  });

  it("the one-tap path through every screen gives a valid profile", () => {
    // Goal: tap an option. Limits: "No limits". Appliances: the typical kitchen. Cooking for: the default 1.
    const profile = toProfile(run({ type: "goal", goal: "eat_well" }, { type: "no_limits" }, { type: "typical_kitchen" }));
    expect(profile).toEqual({
      goal: "eat_well",
      condition: null,
      limits: [],
      limits_other: [],
      appliances: [...TYPICAL_KITCHEN],
      servings: 1,
      targets: null,
    });
  });

  it("choosing a condition sets the goal; choosing another goal clears the condition", () => {
    const a = run({ type: "condition", condition: "kidney" });
    expect(a).toMatchObject({ goal: "condition", condition: "kidney" });
    expect(toProfile(a).condition).toBe("kidney");
    expect(reduce(a, { type: "goal", goal: "cut" })).toMatchObject({ goal: "cut", condition: null });
  });

  it("toggles limits and appliances", () => {
    const a = run({ type: "goal", goal: "cut" }, { type: "toggle_limit", limit: "halal" }, { type: "toggle_limit", limit: "nuts" }, { type: "toggle_limit", limit: "halal" });
    expect(a.limits).toEqual(["nuts"]);
    const b = run({ type: "toggle_appliance", method: "oven" }, { type: "toggle_appliance", method: "kettle" }, { type: "toggle_appliance", method: "oven" });
    expect(b.appliances).toEqual(["kettle"]);
  });

  it("adds free-text limits trimmed, once, ignoring case", () => {
    const a = run({ type: "add_other", text: "  cilantro " }, { type: "add_other", text: "Cilantro" }, { type: "add_other", text: "  " });
    expect(a.limits_other).toEqual(["cilantro"]);
    expect(reduce(a, { type: "remove_other", text: "cilantro" }).limits_other).toEqual([]);
  });

  it("'No limits' and 'None of these' clear earlier choices", () => {
    const a: Answers = { ...START, limits: ["gluten"], limits_other: ["cilantro"], appliances: ["oven"] };
    expect(reduce(a, { type: "no_limits" })).toMatchObject({ limits: [], limits_other: [] });
    expect(reduce(a, { type: "no_appliances" }).appliances).toEqual([]);
  });

  it("no appliances is a valid answer: the engine deals no-cook dishes", () => {
    expect(toProfile(run({ type: "goal", goal: "bulk" }, { type: "no_appliances" })).appliances).toEqual([]);
  });

  it("keeps servings between 1 and 12", () => {
    expect(run({ type: "servings", servings: 0 }).servings).toBe(1);
    expect(run({ type: "servings", servings: 40 }).servings).toBe(12);
    expect(run({ type: "servings", servings: 3 }).servings).toBe(3);
  });

  it("offers every limit and appliance the contract knows", async () => {
    const { LIMITS, APPLIANCES } = await import("../src/onboarding/options");
    expect(LIMITS.map((l) => l.limit).sort()).toEqual([...Limit.options].sort());
    expect(APPLIANCES.map((a) => a.method).sort()).toEqual([...Method.options].sort());
  });
});
