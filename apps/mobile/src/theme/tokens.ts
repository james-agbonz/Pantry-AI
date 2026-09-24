import raw from "../../../../design/tokens.json";

/**
 * `design/tokens.json` turned into React Native values. This is the only file
 * that reads raw values; everything else uses these names (DESIGN.md).
 */

type Named = { name: string; value: string };

/** "16px" → 16. */
export function px(value: string): number {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (!m) throw new Error(`not a px value: ${value}`);
  return Number(m[1]);
}

/** Resolves `{name}` references against the same token list. */
function resolve(tokens: readonly Named[]): Record<string, string> {
  const byName = new Map(tokens.map((t) => [t.name, t.value]));
  const out: Record<string, string> = {};
  for (const t of tokens) {
    let v = t.value;
    for (let i = 0; i < 5 && /^\{.+\}$/.test(v); i++) {
      const ref = byName.get(v.slice(1, -1));
      if (ref === undefined) throw new Error(`unknown token reference ${v}`);
      v = ref;
    }
    out[t.name] = v;
  }
  return out;
}

function table<K extends string>(tokens: readonly Named[], map: (v: string) => number): Record<K, number> {
  return Object.fromEntries(tokens.map((t) => [t.name, map(t.value)])) as Record<K, number>;
}

export type ColorName =
  | "canvas" | "surface" | "surface-soft" | "hairline" | "border-strong" | "ink" | "muted"
  | "primary" | "primary-active" | "primary-soft" | "on-primary"
  | "fits" | "fits-soft" | "complete" | "complete-soft" | "over" | "over-soft" | "focus";

export const color = resolve(raw.color.tokens) as Record<ColorName, string>;

export type SpaceName = "space-1" | "space-2" | "space-3" | "space-4" | "space-6" | "space-8";
export const space = table<SpaceName>(raw.spacing.tokens, px);

export type RadiusName = "radius-sm" | "radius-md" | "radius-lg" | "radius-pill";
export const radius = table<RadiusName>(raw.radius.tokens, px);

export type TypeName =
  | "display" | "title" | "title-sm" | "body" | "body-sm" | "caption" | "label"
  | "num-lg" | "num" | "num-sm";

/**
 * Loaded font files, one per family and weight. React Native picks a weight by
 * file name, not `fontWeight`, so each style names its file.
 */
export const FONT_FILES = {
  sans: { 400: "Inter_400Regular", 500: "Inter_500Medium", 600: "Inter_600SemiBold", 700: "Inter_700Bold" },
  numeric: { 500: "IBMPlexSans_500Medium", 600: "IBMPlexSans_600SemiBold" },
} as const;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
}

export const type = Object.fromEntries(
  raw.type.groups.flatMap((g) =>
    g.styles.map((s) => {
      const family = FONT_FILES[g.family as keyof typeof FONT_FILES] as Record<number, string>;
      const fontFamily = family[s.fontWeight];
      if (!fontFamily) throw new Error(`no ${g.family} font file for weight ${s.fontWeight} (${s.name})`);
      const fontSize = px(s.fontSize);
      const style: TextStyleToken = { fontFamily, fontSize, lineHeight: px(s.lineHeight) };
      const ls = "letterSpacing" in s ? /^(-?[\d.]+)em$/.exec(String(s.letterSpacing)) : null;
      if (ls) style.letterSpacing = Number(ls[1]) * fontSize;
      return [s.name, style];
    }),
  ),
) as Record<TypeName, TextStyleToken>;

/** `shadow-lift`, for the top card of the deck only (5b). */
export const shadowLift = raw.shadow.tokens[0]!.value;

/**
 * Sizes DESIGN.md sets in prose rather than tokens: touch targets, chip and
 * badge heights, icon sizes and stroke.
 */
export const size = {
  touch: 44,
  chip: 40,
  badge: 28,
  icon: 20,
  iconLg: 24,
  iconStroke: 1.5,
  /** Hairline and control edges. */
  border: 1,
  /** Keyboard focus ring (DESIGN.md: 2px, offset 2px). */
  focus: 2,
} as const;
