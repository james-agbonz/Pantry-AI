import type { Vocabulary } from "@pantry/vocabulary";

/** Families open when Home first shows: the everyday staples. The rest start closed (SPEC §4). */
export const OPEN_BY_DEFAULT: readonly string[] = ["grains", "vegetables", "legumes", "eggs"];

export interface Section {
  family: string;
  label: string;
  groups: { id: string; label: string }[];
}

/** Families in vocabulary order, each with its groups. */
export function sections(v: Pick<Vocabulary, "families" | "groups">): Section[] {
  return v.families
    .map((f) => ({
      family: f.id,
      label: f.label,
      groups: v.groups.filter((g) => g.family === f.id).map((g) => ({ id: g.id, label: g.label })),
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
export function search(v: Pick<Vocabulary, "families" | "groups">, query: string): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { groups: [], freeText: null };
  const familyLabel = new Map(v.families.map((f) => [f.id, f.label.toLowerCase()]));
  const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const hits = v.groups.filter((g) =>
    [...words(g.label), ...words(familyLabel.get(g.family) ?? "")].some((w) => w.startsWith(q)) || g.label.toLowerCase().startsWith(q),
  );
  const exact = hits.some((g) => g.label.toLowerCase() === q);
  return { groups: hits.map((g) => ({ id: g.id, label: g.label })), freeText: exact ? null : query.trim() };
}
