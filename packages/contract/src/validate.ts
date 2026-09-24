import { Card } from "./card";
import type { EngineInput } from "./input";

/**
 * The slice of the vocabulary the validator needs: which groups exist, which
 * family each belongs to, and which allergens it contains (SPEC §6).
 * Supplied by the vocabulary module.
 */
export interface GroupRef {
  group: string;
  family: string;
  /** Health Canada priority allergens plus gluten, e.g. `["soy", "wheat", "gluten"]`. */
  contains: readonly string[];
  /** Display name, e.g. "Coconut milk". Lets the text scan recognise the group when a step names it. */
  label?: string;
}

export type CardErrorCode =
  | "invalid_json"
  | "invalid_shape"
  | "excluded_ingredient"
  | "unknown_group"
  | "method_not_allowed";

export interface CardError {
  code: CardErrorCode;
  message: string;
  /** Where on the card, e.g. `missing.0.group` or `steps.2`. */
  path?: string;
}

export type CardCheck = { ok: true; card: Card } | { ok: false; errors: CardError[] };

export interface ValidateContext {
  input: Pick<EngineInput, "exclude" | "methods" | "have_other">;
  groups: readonly GroupRef[];
}

/**
 * Checks one card against SPEC §7: valid JSON, no excluded ingredient
 * anywhere, every group exists, every method allowed. Collects every failure
 * rather than stopping at the first, so the retry prompt can name them all.
 */
export function validateCard(raw: unknown, ctx: ValidateContext): CardCheck {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (e) {
      return { ok: false, errors: [{ code: "invalid_json", message: String(e) }] };
    }
  }

  const parsed = Card.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({
        code: "invalid_shape",
        message: i.message,
        path: i.path.join("."),
      })),
    };
  }
  const card = parsed.data;

  const errors = [
    ...checkGroups(card, ctx),
    ...checkMethods(card, ctx),
    ...checkExclude(card, ctx),
  ];
  return errors.length ? { ok: false, errors } : { ok: true, card };
}

export interface DeckCheck {
  /** Cards that passed, in engine order. */
  cards: Card[];
  /** Cards that failed, by position in the engine output. Each is regenerated alone. */
  failed: { index: number; errors: CardError[] }[];
}

/**
 * Validates a whole deck card by card. If the deck itself isn't a JSON array,
 * every one of the `expected` slots is reported as failed.
 */
export function validateDeck(raw: unknown, ctx: ValidateContext, expected: number): DeckCheck {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (e) {
      return allFailed(expected, { code: "invalid_json", message: String(e) });
    }
  }
  if (!Array.isArray(value)) {
    return allFailed(expected, { code: "invalid_shape", message: "deck is not an array" });
  }

  const out: DeckCheck = { cards: [], failed: [] };
  for (let index = 0; index < expected; index++) {
    const result =
      index < value.length
        ? validateCard(value[index], ctx)
        : { ok: false as const, errors: [{ code: "invalid_shape" as const, message: "card missing from deck" }] };
    if (result.ok) out.cards.push(result.card);
    else out.failed.push({ index, errors: result.errors });
  }
  return out;
}

function allFailed(expected: number, error: CardError): DeckCheck {
  return { cards: [], failed: Array.from({ length: expected }, (_, index) => ({ index, errors: [error] })) };
}

// ── Checks ────────────────────────────────────────────────────────────────

function checkGroups(card: Card, ctx: ValidateContext): CardError[] {
  const known = new Set(ctx.groups.map((g) => g.group));
  const freeText = new Set(ctx.input.have_other.map(normalize));
  const errors: CardError[] = [];

  card.missing.forEach((m, i) => {
    if (!known.has(m.group)) {
      errors.push({ code: "unknown_group", message: `'${m.group}' is not in the group list`, path: `missing.${i}.group` });
    }
  });
  // `uses` may also name free-text items the user typed in.
  card.uses.forEach((u, i) => {
    if (!known.has(u) && !freeText.has(normalize(u))) {
      errors.push({ code: "unknown_group", message: `'${u}' is not a group or a have_other item`, path: `uses.${i}` });
    }
  });
  return errors;
}

function checkMethods(card: Card, ctx: ValidateContext): CardError[] {
  const allowed = new Set(ctx.input.methods);
  return card.methods.flatMap((m, i) =>
    allowed.has(m) ? [] : [{ code: "method_not_allowed" as const, message: `'${m}' is not an allowed method`, path: `methods.${i}` }],
  );
}

/**
 * An exclude term fails the card if it rules out a group the card uses, is
 * missing or names in its text, or if it appears as a word in the text that's
 * left once group names are masked. Groups are judged by their tags (see
 * `excludeHits`), so "coconut milk" in a step passes No dairy while "cheese"
 * fails it. The word scan catches free-text excludes (e.g. "cilantro") and
 * things no group covers ("gelatin"). "-free" compounds never match.
 */
function checkExclude(card: Card, ctx: ValidateContext): CardError[] {
  const terms = ctx.input.exclude.map(normalize).filter(Boolean);
  if (!terms.length) return [];

  const tagTerms = tagTermsOf(ctx.groups);
  const byId = new Map(ctx.groups.map((g) => [g.group, g]));
  const errors: CardError[] = [];
  const fail = (path: string, message: string) => {
    if (!errors.some((e) => e.path === path)) errors.push({ code: "excluded_ingredient", message, path });
  };

  const groupRefs: [string, string][] = [
    ...card.uses.map((g, i): [string, string] => [g, `uses.${i}`]),
    ...card.missing.map((m, i): [string, string] => [m.group, `missing.${i}.group`]),
  ];
  for (const [id, path] of groupRefs) {
    const group = byId.get(id);
    const hit = group && excludeHits(group, terms, tagTerms)[0];
    if (hit) fail(path, `'${id}' is excluded ('${hit}')`);
  }

  const names = groupNames(ctx.groups);
  const texts: [string, string][] = [
    [card.name, "name"],
    ...card.uses.map((t, i): [string, string] => [t, `uses.${i}`]),
    ...card.missing.map((m, i): [string, string] => [m.group, `missing.${i}.group`]),
    ...card.steps.map((t, i): [string, string] => [t, `steps.${i}`]),
    [card.image_prompt, "image_prompt"],
  ];
  for (const [text, path] of texts) {
    let rest = text;
    for (const { group, re } of names) {
      rest = rest.replace(re, (match) => {
        const hit = excludeHits(group, terms, tagTerms)[0];
        if (hit) fail(path, `mentions '${match}', excluded ('${hit}')`);
        return " ";
      });
    }
    const term = terms.find((t) => termPattern(t).test(rest));
    if (term) fail(path, `mentions excluded '${term}'`);
  }
  return errors;
}

/**
 * The exclude terms that rule a group out. Supply the full group list so it
 * knows which terms are families or allergen tags.
 * The same rules `validateCard` applies, so the engine can drop these groups
 * from the prompt before the model ever sees them.
 */
export function excludedBy(group: GroupRef, exclude: readonly string[], groups: readonly GroupRef[]): string[] {
  return excludeHits(group, exclude.map(normalize).filter(Boolean), tagTermsOf(groups));
}

/**
 * A group is ruled out by a term equal to its id, family or a `contains` tag.
 * A term that is some group's family or tag (`milk`, `dairy`, `gluten`) judges
 * a group only that way, so `milk` doesn't catch `coconut_milk`. Any other term
 * is free text, and also matches as a word in the group's id or label, so
 * `chicken` catches `ground_chicken`.
 */
function excludeHits(group: GroupRef, terms: readonly string[], tagTerms: ReadonlySet<string>): string[] {
  const tags = new Set([normalize(group.group), normalize(group.family), ...group.contains.map(normalize)]);
  return terms.filter(
    (t) =>
      tags.has(t) ||
      (!tagTerms.has(t) && (termPattern(t).test(group.group) || (group.label !== undefined && termPattern(t).test(group.label)))),
  );
}

function tagTermsOf(groups: readonly GroupRef[]): Set<string> {
  return new Set(groups.flatMap((g) => [normalize(g.family), ...g.contains.map(normalize)]));
}

/** Every way a group is written (id and label), longest first so "coconut milk" masks before "milk". */
function groupNames(groups: readonly GroupRef[]): { group: GroupRef; re: RegExp }[] {
  return groups
    .flatMap((group) => [group.group, ...(group.label ? [group.label] : [])].map((name) => ({ group, name: normalize(name) })))
    .sort((a, b) => b.name.length - a.name.length)
    .map(({ group, name }) => ({ group, re: termPattern(name, "giu") }));
}

/** Lowercase, with spaces and hyphens folded to `_` so "white fish" = `white_fish`. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Whole-word, case-insensitive, singular or plural: "nuts" matches "nut" and
 * "Nuts"; "white_fish" matches "white fish". Letters only count as word
 * characters, so `_` in group ids acts as a separator. Never matches the
 * first half of a "-free" compound: "meat-free" doesn't mention meat.
 */
function termPattern(term: string, flags = "iu"): RegExp {
  const stems = new Set([term, term.replace(/s$/, ""), term.replace(/es$/, "")]);
  const body = [...stems]
    .filter((s) => s.length >= 3 || s === term)
    .map((s) =>
      s
        .split("_")
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[\\s_-]+"),
    )
    .join("|");
  return new RegExp(`(?<![\\p{L}])(?:${body})(?:e?s)?(?![\\p{L}])(?!-free)`, flags);
}
