import { EngineInput, excludeTerms, Profile, Session } from "@pantry/contract";
import type { Diet } from "@pantry/vocabulary";

// Profile, Session, Limit and the limit terms moved to the contract: the app uses them too.
export { excludeTerms, Limit, LIMIT_TERMS, Profile, Session } from "@pantry/contract";

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

  const exclude = excludeTerms(p);

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
