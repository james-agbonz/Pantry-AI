import type { Condition, Goal, Limit, Method } from "@pantry/contract";

/** Onboarding wording (SPEC §3). Sentence case; short; no judgment (DESIGN.md › Content). */

export const GOALS: { goal: Exclude<Goal, "condition">; label: string; hint: string }[] = [
  { goal: "eat_well", label: "Eat well on little", hint: "Filling, balanced meals" },
  { goal: "cut", label: "Cut", hint: "Lose fat, keep muscle" },
  { goal: "bulk", label: "Bulk", hint: "Gain muscle" },
];

export const CONDITION_LABEL = "Managing a condition";

export const CONDITIONS: { condition: Condition; label: string }[] = [
  { condition: "diabetes", label: "Diabetes" },
  { condition: "blood_pressure", label: "Blood pressure" },
  { condition: "anemia", label: "Anemia" },
  { condition: "kidney", label: "Kidney" },
  { condition: "other", label: "Something else" },
];

export const LIMITS: { limit: Limit; label: string }[] = [
  { limit: "halal", label: "Halal" },
  { limit: "vegetarian", label: "Vegetarian" },
  { limit: "no_pork", label: "No pork" },
  { limit: "no_dairy", label: "No dairy" },
  { limit: "nuts", label: "Nuts" },
  { limit: "gluten", label: "Gluten" },
];

/** Appliances in the order the screen shows them. Icons are in `icons.ts`. */
export const APPLIANCES: { method: Method; label: string }[] = [
  { method: "stove", label: "Stove or hotplate" },
  { method: "oven", label: "Oven" },
  { method: "microwave", label: "Microwave" },
  { method: "fridge", label: "Fridge" },
  { method: "freezer", label: "Freezer" },
  { method: "kettle", label: "Kettle" },
  { method: "blender", label: "Blender" },
  { method: "air_fryer", label: "Air fryer" },
  { method: "rice_cooker", label: "Rice or slow cooker" },
];
