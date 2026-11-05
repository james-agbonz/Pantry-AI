import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { pickTable } from "../src/data/priceTable";
import { deckPriceNote, monthLabel, priceNote } from "../src/format";

/** A publish date `n` days after (or before) the bundled table's, so the weekly refresh never dates these tests. */
const day = (n: number) => new Date(Date.parse(`${vocabulary.version}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The shipped table with every price bumped and re-sourced, under another version. */
const table = (version: string, bump = 0, source = "placeholder") => ({
  schema: 2,
  version,
  stores: vocabulary.stores,
  items: vocabulary.items,
  prices: vocabulary.prices.map((p) => ({ ...p, regular: Math.round((p.regular + bump) * 100) / 100, sale: null, source, updated: source === "placeholder" ? null : vocabulary.version })),
});

describe("which price table the app uses (SPEC §16)", () => {
  it("a fetched table that checks out wins, even over a newer cached one", () => {
    const r = pickTable(vocabulary, { fetched: table(day(7), 1, "statcan"), cached: table(day(14)) });
    expect(r.from).toBe("fetched");
    expect(r.vocabulary.version).toBe(day(7));
    expect(r.vocabulary.placeholder).toBe(false);
  });

  it("with no fetch, the cached table if it's at least as new as the bundled one", () => {
    expect(pickTable(vocabulary, { cached: table(day(7)) })).toMatchObject({ from: "cached" });
    expect(pickTable(vocabulary, { cached: table(day(-30)) }).from).toBe("bundled");
  });

  it("never uses a table that fails the check", () => {
    const broken = { ...table(day(30)), items: vocabulary.items.slice(0, 3) };
    expect(pickTable(vocabulary, { fetched: broken, cached: { nonsense: true } }).from).toBe("bundled");
    expect(pickTable(vocabulary, { fetched: { ...table(day(30)), version: "December" } }).from).toBe("bundled");
  });

  it("publish dates order correctly: a real table published later beats the bundled placeholder", () => {
    // The bug this fixes: "2026-09-placeholder" sorted after "2026-09-25" as text.
    const bundledPlaceholder = vocabulary.withTable({ ...table("2026-09-01"), version: "2026-09-01" });
    expect(pickTable(bundledPlaceholder, { cached: table("2026-09-25", 0, "statcan") }).from).toBe("cached");
  });

  it("falls back to the bundled table with nothing else", () => {
    expect(pickTable(vocabulary, {})).toEqual({ vocabulary, from: "bundled" });
  });

  it("prices follow the table in use", () => {
    const next = pickTable(vocabulary, { fetched: table(day(7), 1) }).vocabulary;
    const id = vocabulary.items[0]!.id;
    expect(next.pricesFor(id)[0]!.regular).toBeCloseTo(vocabulary.pricesFor(id)[0]!.regular + 1, 2);
  });
});

describe("price note", () => {
  it("never calls placeholder prices typical", () => {
    expect(priceNote(true)).toBe("Sample prices for testing, not real.");
    expect(priceNote(false, "2026-07")).toBe("Typical prices, July 2026.");
    expect(monthLabel("2026-12")).toBe("December 2026");
    expect(deckPriceNote([{ placeholder: false, as_of: "2026-08" }, { placeholder: false, as_of: "2026-07" }])).toBe("Typical prices, July 2026.");
    expect(deckPriceNote([{ placeholder: false, as_of: "2026-07" }, { placeholder: true, as_of: null }])).toBe("Sample prices for testing, not real.");
  });
});
