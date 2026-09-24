import { Condition, EngineInput, Goal, GroupId, Method, Targets } from "@pantry/contract";
import type { Diet } from "@pantry/vocabulary";
import { z } from "zod";

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

export interface Constraints {
  input: EngineInput;
  diet: Diet;
}

/**
 * Profile + session → engine input (SPEC §16). Diets become `exclude` terms;
 * halal also sets `diet.halal`, which the vocabulary uses to narrow meat
 * groups to certified items. The result is parsed, so a bad build throws.
 */
export function buildConstraints(profile: Profile, session: Session, deck = 6): Constraints {
  const p = Profile.parse(profile);
  const s = Session.parse(session);

  const exclude = dedupe([...p.limits.flatMap((l) => LIMIT_TERMS[l]), ...p.limits_other]);

  const input = EngineInput.parse({
    have: s.have.map((group) => ({ group })),
    have_other: s.have_other,
    budget: s.budget,
    goal: p.goal,
    condition: p.condition,
    exclude,
    methods: dedupe(p.appliances),
    targets: p.targets,
    servings: p.servings,
    deck,
    avoid: s.avoid,
  });
  return { input, diet: { halal: p.limits.includes("halal") } };
}

/** Keeps the first spelling of each term, ignoring case and surrounding space. */
function dedupe<T extends string>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
