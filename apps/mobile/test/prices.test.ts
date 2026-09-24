import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { pickTable } from "../src/data/priceTable";
import { priceNote } from "../src/format";

const table = (version: string, bump = 0, source = "placeholder") => ({
  version,
  items: vocabulary.items.map((i) => ({ ...i, price: Math.round((i.price! + bump) * 100) / 100, price_source: source, updated: source === "placeholder" ? null : "2026-10-01" })),
});

describe("which price table the app uses (SPEC §16)", () => {
  it("a fetched table that checks out wins, even over a newer cached one", () => {
    const r = pickTable(vocabulary, { fetched: table("2026-10", 1, "statcan"), cached: table("2026-11") });
    expect(r.from).toBe("fetched");
    expect(r.vocabulary.version).toBe("2026-10");
    expect(r.vocabulary.placeholder).toBe(false);
  });

  it("with no fetch, the cached table if it's at least as new as the bundled one", () => {
    expect(pickTable(vocabulary, { cached: table("2026-10") })).toMatchObject({ from: "cached" });
    expect(pickTable(vocabulary, { cached: table("2026-08") }).from).toBe("bundled");
  });

  it("never uses a table that fails the check", () => {
    const broken = { version: "2026-12", items: vocabulary.items.slice(0, 3) };
    expect(pickTable(vocabulary, { fetched: broken, cached: { nonsense: true } }).from).toBe("bundled");
    expect(pickTable(vocabulary, { fetched: { ...table("2026-12"), version: "December" } }).from).toBe("bundled");
  });

  it("falls back to the bundled table with nothing else", () => {
    expect(pickTable(vocabulary, {})).toEqual({ vocabulary, from: "bundled" });
  });

  it("prices follow the table in use", () => {
    const next = pickTable(vocabulary, { fetched: table("2026-10", 1) }).vocabulary;
    const id = vocabulary.items[0]!.id;
    expect(next.items.find((i) => i.id === id)!.price).toBeCloseTo(vocabulary.items[0]!.price! + 1, 2);
  });
});

describe("price note", () => {
  it("never calls placeholder prices typical", () => {
    expect(priceNote(true)).toBe("Sample prices for testing, not real.");
    expect(priceNote(false)).toBe("Prices are typical, not quotes.");
  });
});
