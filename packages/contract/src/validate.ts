import { Card } from "./card";
import type { EngineInput } from "./input";

/**
 * The slice of the vocabulary the validator needs: which groups exist and
 * which family each belongs to (SPEC §6). Supplied by the vocabulary module.
 */
export interface GroupRef {
  group: string;
  family: string;
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
 * An exclude term fails the card if it names a group or family the card
 * touches, or if it appears as a word in any text on the card. The text scan
 * catches free-text excludes (e.g. "cilantro"); the family match catches
 * "dairy" when the card uses `cheese`.
 */
function checkExclude(card: Card, ctx: ValidateContext): CardError[] {
  const terms = ctx.input.exclude.map(normalize).filter(Boolean);
  if (!terms.length) return [];

  const familyOf = new Map(ctx.groups.map((g) => [g.group, normalize(g.family)]));
  const errors: CardError[] = [];

  const groupRefs: [string, string][] = [
    ...card.uses.map((g, i): [string, string] => [g, `uses.${i}`]),
    ...card.missing.map((m, i): [string, string] => [m.group, `missing.${i}.group`]),
  ];
  for (const [group, path] of groupRefs) {
    const g = normalize(group);
    const family = familyOf.get(group);
    for (const term of terms) {
      if (term === g || term === family) {
        errors.push({ code: "excluded_ingredient", message: `'${group}' is excluded ('${term}')`, path });
      }
    }
  }

  const texts: [string, string][] = [
    [card.name, "name"],
    ...card.uses.map((t, i): [string, string] => [t, `uses.${i}`]),
    ...card.missing.map((m, i): [string, string] => [m.group, `missing.${i}.group`]),
    ...card.steps.map((t, i): [string, string] => [t, `steps.${i}`]),
    [card.image_prompt, "image_prompt"],
  ];
  for (const term of terms) {
    const re = termPattern(term);
    for (const [text, path] of texts) {
      if (re.test(text) && !errors.some((e) => e.path === path)) {
        errors.push({ code: "excluded_ingredient", message: `mentions excluded '${term}'`, path });
      }
    }
  }
  return errors;
}

/** Lowercase, with spaces and hyphens folded to `_` so "white fish" = `white_fish`. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Whole-word, case-insensitive, singular or plural: "nuts" matches "nut" and
 * "Nuts"; "white_fish" matches "white fish". Letters only count as word
 * characters, so `_` in group ids acts as a separator.
 */
function termPattern(term: string): RegExp {
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
  return new RegExp(`(?<![\\p{L}])(?:${body})(?:e?s)?(?![\\p{L}])`, "iu");
}
