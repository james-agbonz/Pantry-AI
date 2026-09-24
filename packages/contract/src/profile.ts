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


/**
 * Exclude terms per hard limit. Each term is matched against group ids,
 * families and `contains` tags, and as a word in every text on the card
 * (SPEC §7), so family names catch whole families and words catch free text.
 *
 * The first four rows are the SPEC's. Vegetarian and halal are expanded here:
 * - vegetarian — every animal-flesh family, plus words for flesh and flesh
 *   products the families don't cover when they turn up in steps or names.
 * - halal — acts on items (meat groups resolve to halal-certified items, §6),
 *   and these terms keep pork, pork fats, gelatin and alcohol out of the text.
 */
export const LIMIT_TERMS: Record<Limit, readonly string[]> = {
  no_pork: ["pork"],
  no_dairy: ["dairy", "milk"],
  nuts: ["nuts", "peanuts", "tree_nuts"],
  gluten: ["gluten"],
  vegetarian: [
    "poultry", "beef", "pork", "lamb", "fish", "shellfish",
    "meat", "chicken", "turkey", "bacon", "ham", "sausage", "gelatin", "lard",
  ],
  halal: ["pork", "bacon", "ham", "lard", "gelatin", "alcohol", "wine", "beer"],
};

/**
 * The profile's hard limits as `exclude` terms: each limit's terms, then the
 * free-text limits as typed, each term once. The engine gets these, and Home
 * uses them to hide what the engine could never use. Halal's item rule
 * (certified meat only) is separate: see the vocabulary's `Diet`.
 */
export function excludeTerms(p: Pick<Profile, "limits" | "limits_other">): string[] {
  const seen = new Set<string>();
  return [...p.limits.flatMap((l) => LIMIT_TERMS[l]), ...p.limits_other].filter((t) => {
    const k = t.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
