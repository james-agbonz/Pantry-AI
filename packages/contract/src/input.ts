import { z } from "zod";

/** Goals from onboarding screen 1 (SPEC §3). */
export const Goal = z.enum(["eat_well", "cut", "bulk", "condition"]);
export type Goal = z.infer<typeof Goal>;

/** Conditions under the "Managing a condition" goal (SPEC §3). */
export const Condition = z.enum(["diabetes", "blood_pressure", "anemia", "kidney", "other"]);
export type Condition = z.infer<typeof Condition>;

/**
 * Appliances from onboarding screen 3 (SPEC §3). Knife, pan, bowl and plate
 * are assumed and never listed. `rice_cooker` covers rice cooker / slow cooker.
 */
export const Method = z.enum([
  "stove",
  "oven",
  "microwave",
  "fridge",
  "freezer",
  "kettle",
  "blender",
  "air_fryer",
  "rice_cooker",
]);
export type Method = z.infer<typeof Method>;

/** A vocabulary group id, e.g. `white_fish` (SPEC §6). */
export const GroupId = z.string().trim().min(1);

export const Targets = z.strictObject({
  kcal: z.number().positive(),
  protein: z.number().positive(),
});
export type Targets = z.infer<typeof Targets>;

/** Engine input (SPEC §5). */
export const EngineInput = z
  .strictObject({
    have: z.array(z.strictObject({ group: GroupId })),
    /** Free-text items from the "something else" search. */
    have_other: z.array(z.string().trim().min(1)),
    /** CAD, for this session. */
    budget: z.number().nonnegative(),
    goal: Goal,
    condition: Condition.nullable(),
    /** Absolute. Checked on every card after generation. */
    exclude: z.array(z.string().trim().min(1)),
    methods: z.array(Method),
    /** `null` when body stats are skipped; the engine steers by goal alone. */
    targets: Targets.nullable(),
    servings: z.number().int().positive(),
    deck: z.number().int().positive(),
    /** Dish names passed this session. */
    avoid: z.array(z.string()),
  })
  .refine((i) => (i.goal === "condition") === (i.condition !== null), {
    message: "condition is required when goal is 'condition', and must be null otherwise",
    path: ["condition"],
  });
export type EngineInput = z.infer<typeof EngineInput>;
