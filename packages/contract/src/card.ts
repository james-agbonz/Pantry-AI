import { z } from "zod";
import { GroupId, Method } from "./input";

/**
 * needed    — the dish can't be made without it.
 * completes — the dish works without it, but this makes it a proper meal.
 */
export const Role = z.enum(["needed", "completes"]);
export type Role = z.infer<typeof Role>;

export const MissingItem = z.strictObject({
  group: GroupId,
  qty: z.string().trim().min(1),
  role: Role,
});
export type MissingItem = z.infer<typeof MissingItem>;

/**
 * One card of engine output (SPEC §5). Objects are strict: the engine never
 * states a price, so any extra key (a `price`, say) fails the card.
 */
export const Card = z.strictObject({
  id: z.string(),
  name: z.string().trim().min(1),
  time_min: z.number().int().positive(),
  /** Model estimate in v1; always displayed with `~`. */
  kcal: z.number().nonnegative(),
  /** Model estimate in v1; always displayed with `~`. */
  protein_g: z.number().nonnegative(),
  /** What the dish uses from `have` / `have_other`. */
  uses: z.array(z.string().trim().min(1)),
  missing: z.array(MissingItem),
  /** Appliances the dish needs. Empty for a no-cook dish. */
  methods: z.array(Method),
  steps: z.array(z.string().trim().min(1)).min(1),
  image_prompt: z.string(),
});
export type Card = z.infer<typeof Card>;
