import { Condition, Goal, Targets } from "@pantry/contract";
import { z } from "zod";

/** `null` when the user skips the question. */
export const Sex = z.enum(["male", "female", "other"]).nullable();
export type Sex = z.infer<typeof Sex>;

export const Activity = z.enum(["sedentary", "light", "moderate", "very_active"]);
export type Activity = z.infer<typeof Activity>;

/** Body stats, asked after the first meal for cut, bulk or condition (SPEC §3). */
export const BodyStats = z.strictObject({
  height_cm: z.number().positive(),
  weight_kg: z.number().positive(),
  age: z.number().int().positive(),
  sex: Sex,
  activity: Activity,
});
export type BodyStats = z.infer<typeof BodyStats>;

/** Mostly sitting · light · moderate · very active (SPEC §8). */
export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

/**
 * Calories as a multiple of maintenance, and protein in g per kg (SPEC §8).
 * "Managing a condition" eats like Eat well; its rules shape the dishes, not
 * the totals (confirmed with the product owner).
 */
export const GOAL_RULES: Record<Goal, { kcal: number; protein_per_kg: number }> = {
  eat_well: { kcal: 1, protein_per_kg: 1.0 },
  cut: { kcal: 0.85, protein_per_kg: 1.8 },
  bulk: { kcal: 1.1, protein_per_kg: 1.8 },
  condition: { kcal: 1, protein_per_kg: 1.0 },
};

/** Cut never goes below these. Other or skipped sex takes the average (confirmed with the product owner). */
export const CUT_FLOOR_KCAL = { male: 1500, female: 1200, other: 1350 } as const;

/** Kidney: ~0.8 g/kg protein, overriding the goal. */
export const KIDNEY_PROTEIN_PER_KG = 0.8;

export interface NeedsInput {
  goal: Goal;
  condition: Condition | null;
  /** `null` when body stats were skipped. */
  stats: BodyStats | null;
}

/**
 * Daily targets for the engine (SPEC §8). No body stats → `null`, and the
 * engine steers by goal alone. Rounded to whole kcal and grams.
 */
export function computeTargets({ goal, condition, stats }: NeedsInput): Targets | null {
  if (stats === null) return null;
  const s = BodyStats.parse(stats);

  const maintenance = baseline(s) * ACTIVITY_FACTOR[s.activity];
  const rule = GOAL_RULES[goal];

  let kcal = maintenance * rule.kcal;
  if (goal === "cut") kcal = Math.max(kcal, CUT_FLOOR_KCAL[s.sex ?? "other"]);

  const perKg = condition === "kidney" ? KIDNEY_PROTEIN_PER_KG : rule.protein_per_kg;

  return Targets.parse({ kcal: Math.round(kcal), protein: Math.round(perKg * s.weight_kg) });
}

/** Mifflin-St Jeor resting energy, kcal/day. Other or skipped sex: the average of the two formulas. */
export function baseline({ weight_kg, height_cm, age, sex }: BodyStats): number {
  const common = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  const male = common + 5;
  const female = common - 161;
  if (sex === "male") return male;
  if (sex === "female") return female;
  return (male + female) / 2;
}
