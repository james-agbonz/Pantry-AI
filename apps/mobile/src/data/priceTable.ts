import type { Vocabulary } from "@pantry/vocabulary";

/**
 * Which price table to use (SPEC §16). A freshly fetched table that checks
 * out always wins: the server is the source of truth, including when it rolls
 * a bad month back. Otherwise the newer of the cached copy and the one
 * bundled with the app. A table that fails the check is never used.
 */
export function pickTable(base: Vocabulary, candidates: { fetched?: unknown; cached?: unknown }): { vocabulary: Vocabulary; from: "fetched" | "cached" | "bundled" } {
  const load = (raw: unknown): Vocabulary | null => {
    if (raw === undefined || raw === null) return null;
    try {
      return base.withTable(raw);
    } catch {
      return null;
    }
  };
  const fetched = load(candidates.fetched);
  if (fetched) return { vocabulary: fetched, from: "fetched" };
  const cached = load(candidates.cached);
  // Versions are YYYY-MM[-suffix], so they compare as text.
  if (cached && cached.version >= base.version) return { vocabulary: cached, from: "cached" };
  return { vocabulary: base, from: "bundled" };
}
