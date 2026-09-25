import { readFileSync } from "node:fs";
import { vocabulary, type PriceTable } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { buildTable, coverage } from "../src/build";
import { parseCsv } from "../src/csv";
import { MANUAL_COLUMNS, readManual, writeManual } from "../src/manual";
import { StatcanMap, type SeriesPoint } from "../src/map";
import { manualRows, rankPlaceholders } from "../src/rank";

const map = StatcanMap.parse(JSON.parse(readFileSync(new URL("../statcan-map.json", import.meta.url), "utf8")));
const extract = JSON.parse(readFileSync(new URL("./fixtures/statcan-2026-07.json", import.meta.url), "utf8")) as { series: SeriesPoint[] };
const series = new Map(extract.series.map((s) => [s.vector, s]));
// Start every test from an all-placeholder table, whatever the data file holds now.
const current: PriceTable = {
  version: "2026-09-01",
  items: vocabulary.items.map((i) => ({ ...i, price_source: "placeholder" as const, updated: null })),
};
const build = (over: Partial<Parameters<typeof buildTable>[0]> = {}) => buildTable({ current, map: map.items, series, manual: [], publishDate: "2026-09-25", ...over });
const item = (t: PriceTable, id: string) => t.items.find((i) => i.id === id)!;

describe("statcan-map.json", () => {
  it("maps 63 items, exact or per kg, only to items and series that exist", () => {
    expect(Object.keys(map.items)).toHaveLength(63);
    for (const [id, e] of Object.entries(map.items)) {
      expect(vocabulary.items.some((i) => i.id === id)).toBe(true);
      expect(series.get(e.vector)?.title).toBe(`Canada;${e.product}`);
    }
  });

  it("uses per kg only where the item really sells by weight", () => {
    // Loose-produce per-kg prices overstate bags; all-thighs and all-ground-beef averages understate boneless and extra lean.
    for (const id of ["potato_russet_5lb", "potato_yellow_5lb", "sweet_potato_3lb", "apple_3lb", "chicken_thighs_boneless_700g", "ground_beef_extra_lean_454g"]) {
      expect(map.items[id]).toBeUndefined();
    }
  });

  it("never maps a halal item: StatCan has only the regular product", () => {
    for (const id of Object.keys(map.items)) expect(vocabulary.items.find((i) => i.id === id)!.halal).not.toBe(true);
  });
});

describe("buildTable", () => {
  it("takes the exact StatCan price, dated to the StatCan month", () => {
    expect(item(build(), "tuna_chunk_light_170g")).toMatchObject({ price: 1.84, price_source: "statcan", updated: "2026-07-01" });
    expect(item(build(), "milk_2pct_4l")).toMatchObject({ price: 6.99, price_source: "statcan" });
  });

  it("per kg: StatCan's per-kilogram price times the pack weight, to the cent", () => {
    // Ground beef $16.49/kg × 0.454 kg = $7.486 → $7.49; chicken thighs $13.40/kg × 1 kg.
    expect(item(build(), "ground_beef_lean_454g").price).toBe(7.49);
    expect(item(build(), "chicken_thighs_bone_in_1kg").price).toBe(13.4);
  });

  it("leaves unmapped items placeholder, and halal ones too", () => {
    expect(item(build(), "cumin_ground_60g")).toMatchObject({ price_source: "placeholder", updated: null });
    expect(item(build(), "chicken_thighs_halal_1kg").price_source).toBe("placeholder");
  });

  it("takes a hand-entered price with its date", () => {
    const t = build({ manual: [{ item_id: "cumin_ground_60g", price: 2.29, source: "No Frills website", source_detail: "Toronto", date: "2026-09-20" }] });
    expect(item(t, "cumin_ground_60g")).toMatchObject({ price: 2.29, price_source: "manual", updated: "2026-09-20" });
  });

  it("refuses what would quietly corrupt prices", () => {
    expect(() => build({ publishDate: current.version })).toThrow(/must be later/);
    expect(() => build({ manual: [{ item_id: "milk_2pct_1l", price: 3, source: "x", source_detail: "", date: "2026-09-20" }] })).toThrow(/has a StatCan price/);
    expect(() => build({ manual: [{ item_id: "nope", price: 3, source: "x", source_detail: "", date: "2026-09-20" }] })).toThrow(/isn't in the price table/);
    const renamed = new Map(series);
    const v = map.items["milk_2pct_1l"]!.vector;
    renamed.set(v, { ...renamed.get(v)!, title: "Canada;Oat milk, 1 litre" });
    expect(() => build({ series: renamed })).toThrow(/is now 'Canada;Oat milk, 1 litre'/);
    const spaced = new Map(series);
    spaced.set(v, { ...spaced.get(v)!, title: "Canada;Milk, 1 litre " });
    expect(() => build({ series: spaced })).not.toThrow();
    const missing = new Map(series);
    missing.delete(v);
    expect(() => build({ series: missing })).toThrow(/no StatCan data for 'milk_2pct_1l'/);
  });

  it("the result loads, and pricing prefers the real prices", () => {
    const v = vocabulary.withTable(build());
    expect(v.version).toBe("2026-09-25");
    expect(v.placeholder).toBe(true);
    const c = coverage(v);
    expect(c.items).toEqual({ statcan: 63, manual: 0, placeholder: 133, total: 196 });
    expect(c.groups).toMatchObject({ real: 26, mixed: 20, placeholder: 75, total: 121 });
  });
});

describe("fetchLatest", () => {
  it("retries a dropped connection, then gives up with the reason", async () => {
    const { fetchLatest } = await import("../src/statcan");
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      const body = calls === 2
        ? [{ status: "SUCCESS", object: { vectorId: 1, vectorDataPoint: [{ refPer: "2026-07-01", value: 1.84 }] } }]
        : [{ status: "SUCCESS", object: { vectorId: 1, SeriesTitleEn: "Canada;Canned tuna, 170 grams" } }];
      return { ok: true, status: 200, json: async () => body };
    };
    const got = await fetchLatest([1], flaky, { retryMs: 0 });
    expect(got.get(1)).toEqual({ vector: 1, title: "Canada;Canned tuna, 170 grams", period: "2026-07-01", value: 1.84 });
    const down = async () => { throw new Error("ETIMEDOUT"); };
    await expect(fetchLatest([1], down, { retries: 2, retryMs: 0 })).rejects.toThrow(/failed after 2 tries: Error: ETIMEDOUT/);
  });
});

describe("manual-prices.csv", () => {
  const header = MANUAL_COLUMNS.join(",");
  const row = (o: Partial<Record<(typeof MANUAL_COLUMNS)[number], string>>) => MANUAL_COLUMNS.map((c) => o[c] ?? "").join(",");

  it("counts a row only when price, source and date are all there", () => {
    const text = [header, row({ item_id: "a", price: "2.29", source: "No Frills", date: "2026-09-20" }), row({ item_id: "b" })].join("\n");
    const r = readManual(text, "2026-09-25");
    expect(r.errors).toEqual([]);
    expect(r.prices).toEqual([{ item_id: "a", price: 2.29, source: "No Frills", source_detail: "", date: "2026-09-20" }]);
  });

  it("names half-filled rows, bad prices and bad dates by line", () => {
    const text = [
      header,
      row({ item_id: "a", price: "2.29" }),
      row({ item_id: "b", price: "abc", source: "x", date: "2026-09-20" }),
      row({ item_id: "c", price: "2.29", source: "x", date: "20/09/2026" }),
      row({ item_id: "d", price: "2.29", source: "x", date: "2026-12-01" }),
      row({ item_id: "a" }),
    ].join("\n");
    expect(readManual(text, "2026-09-25").errors).toEqual([
      "line 2 (a): missing source, date",
      "line 3 (b): price 'abc' should be dollars like 3.49",
      "line 4 (c): date '20/09/2026' should be YYYY-MM-DD",
      "line 5 (d): date 2026-12-01 is in the future",
      "line 6: 'a' appears twice",
    ]);
  });

  it("keeps commas and quotes in fields intact through a round trip", () => {
    const r = readManual([header, row({ item_id: "a", price: "1.99", source: '"Walmart, Scarborough"', source_detail: '"said ""rollback"""', date: "2026-09-20" })].join("\n"), "2026-09-25");
    expect(r.prices[0]).toMatchObject({ source: "Walmart, Scarborough", source_detail: 'said "rollback"' });
    expect(parseCsv(writeManual(r.rows))[1]).toEqual(["", "a", "", "", "", "1.99", "Walmart, Scarborough", 'said "rollback"', "2026-09-20", ""]);
  });
});

describe("fill order", () => {
  const v = vocabulary.withTable(build());
  const ranked = rankPlaceholders(v);

  it("lists every placeholder item once", () => {
    expect(ranked).toHaveLength(133);
    expect(new Set(ranked.map((r) => r.item_id)).size).toBe(133);
  });

  it("seasonings, oils and garlic first, then proteins, then the rest, then alternatives", () => {
    const tiers = ranked.map((r) => r.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(ranked.slice(0, 4).map((r) => r.group)).toEqual(["cooking_oil", "salt", "black_pepper", "garlic"]);
    expect(ranked.find((r) => r.group === "white_fish")!.tier).toBe(2);
    expect(ranked.find((r) => r.group === "pasta")!.tier).toBe(3);
  });

  it("one row per unpriced group before any alternative: 75 rows clear every Sample prices label", () => {
    const unblocking = ranked.filter((r) => r.tier <= 3 && !r.why.startsWith("Halal"));
    expect(unblocking).toHaveLength(75);
    expect(new Set(unblocking.map((r) => r.group)).size).toBe(75);
    // The row is the item pricing would pick, so filling it really clears the group.
    expect(unblocking.find((r) => r.group === "salt")!.item_id).toBe("salt_1kg");
  });

  it("puts halal meat after the proteins, saying why", () => {
    const halal = ranked.filter((r) => r.why.startsWith("Halal"));
    expect(halal.length).toBeGreaterThan(0);
    for (const h of halal) expect(h.tier).toBe(2);
  });

  it("keeps what's been typed in when re-ranked", () => {
    const rows = manualRows(v, [{ rank: "9", item_id: "salt_1kg", group: "salt", name: "", unit: "", price: "1.79", source: "No Frills", source_detail: "", date: "2026-09-20", why: "" }]);
    expect(rows.find((r) => r.item_id === "salt_1kg")).toMatchObject({ price: "1.79", source: "No Frills", date: "2026-09-20", rank: "2" });
  });
});
