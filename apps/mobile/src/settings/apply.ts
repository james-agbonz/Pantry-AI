import { Profile } from "@pantry/contract";
import { toProfile, type Answers } from "@/onboarding/answers";

/** The saved profile as onboarding answers, so Settings can reuse the same controls. */
export function fromProfile(p: Profile): Answers {
  return {
    goal: p.goal,
    condition: p.condition,
    limits: [...p.limits],
    limits_other: [...p.limits_other],
    appliances: [...p.appliances],
    servings: p.servings,
  };
}

/**
 * The edited profile. Targets are worked out from the goal and condition
 * (SPEC §8), so changing either clears them: cut, bulk and condition are asked
 * for their numbers again, and eat well has none.
 */
export function applySettings(p: Profile, a: Answers): { profile: Profile; targetsCleared: boolean } {
  const next = toProfile(a);
  const goalChanged = next.goal !== p.goal || next.condition !== p.condition;
  const targets = goalChanged ? null : p.targets;
  return { profile: Profile.parse({ ...next, targets }), targetsCleared: goalChanged && p.targets !== null };
}

/** True when the answers differ from what's saved. */
export function isDirty(p: Profile, a: Answers): boolean {
  const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && [...x].sort().join() === [...y].sort().join();
  return !(
    a.goal === p.goal &&
    a.condition === p.condition &&
    same(a.limits, p.limits) &&
    same(a.limits_other, p.limits_other) &&
    same(a.appliances, p.appliances) &&
    a.servings === p.servings
  );
}
