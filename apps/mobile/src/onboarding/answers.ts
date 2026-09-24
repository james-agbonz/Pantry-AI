import { Profile, type Condition, type Goal, type Limit, type Method } from "@pantry/contract";

/** Onboarding answers so far (SPEC §3). Every screen is required; each has a one-tap way through. */
export interface Answers {
  goal: Goal | null;
  condition: Condition | null;
  limits: Limit[];
  limits_other: string[];
  appliances: Method[];
  servings: number;
}

export const START: Answers = { goal: null, condition: null, limits: [], limits_other: [], appliances: [], servings: 1 };

export const SERVINGS = { min: 1, max: 12 } as const;

/** The one-tap way through the appliances screen. */
export const TYPICAL_KITCHEN: readonly Method[] = ["stove", "fridge", "microwave"];

export type Action =
  | { type: "goal"; goal: Exclude<Goal, "condition"> }
  | { type: "condition"; condition: Condition }
  | { type: "toggle_limit"; limit: Limit }
  | { type: "add_other"; text: string }
  | { type: "remove_other"; text: string }
  | { type: "no_limits" }
  | { type: "toggle_appliance"; method: Method }
  | { type: "typical_kitchen" }
  | { type: "no_appliances" }
  | { type: "servings"; servings: number };

export function reduce(a: Answers, action: Action): Answers {
  switch (action.type) {
    case "goal":
      return { ...a, goal: action.goal, condition: null };
    case "condition":
      return { ...a, goal: "condition", condition: action.condition };
    case "toggle_limit":
      return { ...a, limits: toggle(a.limits, action.limit) };
    case "add_other": {
      const text = action.text.trim();
      if (!text || a.limits_other.some((t) => t.toLowerCase() === text.toLowerCase())) return a;
      return { ...a, limits_other: [...a.limits_other, text] };
    }
    case "remove_other":
      return { ...a, limits_other: a.limits_other.filter((t) => t !== action.text) };
    case "no_limits":
      return { ...a, limits: [], limits_other: [] };
    case "toggle_appliance":
      return { ...a, appliances: toggle(a.appliances, action.method) };
    case "typical_kitchen":
      return { ...a, appliances: [...TYPICAL_KITCHEN] };
    case "no_appliances":
      return { ...a, appliances: [] };
    case "servings":
      return { ...a, servings: Math.min(SERVINGS.max, Math.max(SERVINGS.min, Math.round(action.servings))) };
  }
}

/**
 * The finished profile, checked against the contract. Targets stay `null`
 * until body stats are asked, after the first meal (SPEC §3, step 5c).
 * Throws if onboarding isn't finished.
 */
export function toProfile(a: Answers): Profile {
  return Profile.parse({
    goal: a.goal,
    condition: a.condition,
    limits: a.limits,
    limits_other: a.limits_other,
    appliances: a.appliances,
    servings: a.servings,
    targets: null,
  });
}

function toggle<T>(xs: readonly T[], x: T): T[] {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}
