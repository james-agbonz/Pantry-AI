import { z } from "zod";
import { Condition, Goal, GroupId, Method, Targets } from "./input";

/** Hard limits from onboarding screen 2 (SPEC §3). "None" is an empty list. */
export const Limit = z.enum(["halal", "vegetarian", "no_pork", "no_dairy", "nuts", "gluten"]);
export type Limit = z.infer<typeof Limit>;

/** What onboarding collects once (SPEC §3), plus `targets` from the needs calculator (§8). */
export const Profile = z.strictObject({
  goal: Goal,
  condition: Condition.nullable(),
  limits: z.array(Limit),
  /** Free-text hard limits, e.g. "cilantro". Excluded as typed. */
  limits_other: z.array(z.string().trim().min(1)),
  /** Highlighted in the kitchen illustration. */
  appliances: z.array(Method),
  servings: z.number().int().positive(),
  /** `null` when body stats were skipped. */
  targets: Targets.nullable(),
});
export type Profile = z.infer<typeof Profile>;

/** What Home collects each session (SPEC §4), plus dishes passed so far. */
export const Session = z.strictObject({
  have: z.array(GroupId),
  have_other: z.array(z.string().trim().min(1)),
  budget: z.number().nonnegative(),
  avoid: z.array(z.string()),
});
export type Session = z.infer<typeof Session>;

