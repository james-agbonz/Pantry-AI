import { excludedBy } from "@pantry/contract";
import type { Vocabulary } from "@pantry/vocabulary";

/** Families open when Home first shows: the everyday staples. The rest start closed (SPEC §4). */
export const OPEN_BY_DEFAULT: readonly string[] = ["grains", "vegetables", "legumes", "eggs"];

export interface Section {
  family: string;
  label: string;
  groups: { id: string; label: string }[];
}

type Vocab = Pick<Vocabulary, "families" | "groups" | "groupList">;

/**
 * Groups the user's hard limits rule out, by the same rules the validator
 * uses: the engine can never use them, so Home doesn't offer them. Uses the
 * full group list, not the halal item filter, so halal hides pork and nothing
 * more (halal chicken is fine).
 */
export function hiddenGroups(v: Vocab, exclude: readonly string[]): Set<string> {
  if (!exclude.length) return new Set();
  const refs = v.groupList();
  return new Set(refs.filter((g) => excludedBy(g, exclude, refs).length > 0).map((g) => g.group));
}

/** Families in vocabulary order, each with the groups not hidden. A family with none left is dropped. */
export function sections(v: Vocab, exclude: readonly string[] = []): Section[] {
  const hidden = hiddenGroups(v, exclude);
  return v.families
    .map((f) => ({
      family: f.id,
      label: f.label,
      groups: v.groups.filter((g) => g.family === f.id && !hidden.has(g.id)).map((g) => ({ id: g.id, label: g.label })),
    }))
    .filter((s) => s.groups.length > 0);
}

export interface SearchResult {
  groups: { id: string; label: string }[];
  /** The query, offered as a free-text item when no group is named exactly that. */
  freeText: string | null;
}

/**
 * Finds groups whose label or family label has a word starting with the
 * query ("chick" → chicken thighs, chickpeas). Anything without an exact
 * match can be added as typed, into `have_other`.
 */
export function search(v: Vocab, query: string, exclude: readonly string[] = []): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { groups: [], freeText: null };
  const hidden = hiddenGroups(v, exclude);
  const familyLabel = new Map(v.families.map((f) => [f.id, f.label.toLowerCase()]));
  const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const hits = v.groups.filter((g) => !hidden.has(g.id)).filter((g) =>
    [...words(g.label), ...words(familyLabel.get(g.family) ?? "")].some((w) => w.startsWith(q)) || g.label.toLowerCase().startsWith(q),
  );
  const exact = hits.some((g) => g.label.toLowerCase() === q);
  return { groups: hits.map((g) => ({ id: g.id, label: g.label })), freeText: exact ? null : query.trim() };
}
