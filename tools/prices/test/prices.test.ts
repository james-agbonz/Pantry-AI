import { readFileSync } from "node:fs";
import { vocabulary, type Price, type PriceTable } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { buildTable, coverage } from "../src/build";
import { parseCsv } from "../src/csv";
import { MANUAL_COLUMNS, readManual, writeManual } from "../src/manual";
import { StatcanMap, type SeriesPoint } from "../src/map";
import { manualRows, rankPlaceholders } from "../src/rank";
import { manualRecords } from "../src/sources/manual";
import { statcanRecords } from "../src/sources/statcan";

const map = StatcanMap.parse(JSON.parse(readFileSync(new URL("../statcan-map.json", import.meta.url), "utf8")));
const stores = JSON.parse(readFileSync(new URL("../stores.json", import.meta.url), "utf8")).stores;
const extract = JSON.parse(readFileSync(new URL("./fixtures/statcan-2026-07.json", import.meta.url), "utf8")) as { series: SeriesPoint[] };
const series = new Map(extract.series.map((s) => [s.vector, s]));

// Start every test from an all-placeholder table, whatever the data file holds now.
const current: PriceTable = {
  schema: 2,
  version: "2026-09-01",
  stores,
  items: [...vocabulary.items],
  prices: vocabulary.items.map((i) => ({
    item: i.id,
    store: "ca_typical",
    regular: vocabulary.pricesFor(i.id)[0]!.regular,
    sale: null,
    source: "placeholder" as const,
    updated: null,
  })),
};
const statcan = statcanRecords(map.items, series);
const build = (sources: [string, Price[]][] = [["statcan", statcan]], publishDate = "2026-09-25") =>
  buildTable({ current, stores, sources: new Map(sources), publishDate });
const priceOf = (t: PriceTable, item: string, store = "ca_typical") => t.prices.find((p) => p.item === item && p.store === store);

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

describe("the StatCan source", () => {
  it("takes the exact price, at the typical store, dated to the StatCan month", () => {
    expect(statcan.find((r) => r.item === "tuna_chunk_light_170g")).toEqual({
      item: "tuna_chunk_light_170g", store: "ca_typical", regular: 1.84, sale: null, source: "statcan", updated: "2026-07-01",
    });
  });

  it("per kg: StatCan's per-kilogram price times the pack weight, to the cent", () => {
    // Ground beef $16.49/kg × 0.454 kg = $7.486 → $7.49; chicken thighs $13.40/kg × 1 kg.
    expect(statcan.find((r) => r.item === "ground_beef_lean_454g")!.regular).toBe(7.49);
    expect(statcan.find((r) => r.item === "chicken_thighs_bone_in_1kg")!.regular).toBe(13.4);
  });

  it("refuses a series that no longer names the product, and tolerates stray spaces", () => {
    const v = map.items["milk_2pct_1l"]!.vector;
    const renamed = new Map(series).set(v, { ...series.get(v)!, title: "Canada;Oat milk, 1 litre" });
    expect(() => statcanRecords(map.items, renamed)).toThrow(/is now 'Canada;Oat milk, 1 litre'/);
    const spaced = new Map(series).set(v, { ...series.get(v)!, title: "Canada;Milk, 1 litre " });
    expect(() => statcanRecords(map.items, spaced)).not.toThrow();
    const missing = new Map(series);
    missing.delete(v);
    expect(() => statcanRecords(map.items, missing)).toThrow(/no StatCan data for 'milk_2pct_1l'/);
  });
});

describe("fetchLatest", () => {
  it("retries a dropped connection, then gives up with the reason", async () => {
    const { fetchLatest } = await import("../src/statcan");
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      const body =
        calls === 2
          ? [{ status: "SUCCESS", object: { vectorId: 1, vectorDataPoint: [{ refPer: "2026-07-01", value: 1.84 }] } }]
          : [{ status: "SUCCESS", object: { vectorId: 1, SeriesTitleEn: "Canada;Canned tuna, 170 grams" } }];
      return { ok: true, status: 200, json: async () => body };
    };
    const got = await fetchLatest([1], flaky, { retryMs: 0 });
    expect(got.get(1)).toEqual({ vector: 1, title: "Canada;Canned tuna, 170 grams", period: "2026-07-01", value: 1.84 });
    const down = async () => {
      throw new Error("ETIMEDOUT");
    };
    await expect(fetchLatest([1], down, { retries: 2, retryMs: 0 })).rejects.toThrow(/failed after 2 tries: Error: ETIMEDOUT/);
  });
});

describe("buildTable", () => {
  const canola: Price[] = manualRecords([
    { item_id: "canola_oil_946ml", store: "nofrills_lucianos_toronto", price: 4.29, sale: null, source: "Luciano's No Frills, Toronto", source_detail: "", date: "2026-09-25" },
  ]);

  it("merges every source's real prices and keeps placeholders only for items with none", () => {
    const t = build([["statcan", statcan], ["manual", canola]]);
    expect(priceOf(t, "tuna_chunk_light_170g")).toMatchObject({ regular: 1.84, source: "statcan" });
    expect(priceOf(t, "canola_oil_946ml", "nofrills_lucianos_toronto")).toMatchObject({ regular: 4.29, source: "manual", updated: "2026-09-25" });
    // Canola now has a real price, so its placeholder goes.
    expect(priceOf(t, "canola_oil_946ml")).toBeUndefined();
    expect(priceOf(t, "cumin_ground_60g")).toMatchObject({ source: "placeholder", updated: null });
    expect(priceOf(t, "chicken_thighs_halal_1kg")?.source).toBe("placeholder");
  });

  it("a store's price for a StatCan item sits beside the typical one", () => {
    const shop = manualRecords([{ item_id: "milk_2pct_4l", store: "nofrills_lucianos_toronto", price: 6.49, sale: { price: 5.99, ends: "2026-10-01" }, source: "No Frills", source_detail: "", date: "2026-09-25" }]);
    const t = build([["statcan", statcan], ["manual", shop]]);
    expect(t.prices.filter((p) => p.item === "milk_2pct_4l").map((p) => p.store)).toEqual(["ca_typical", "nofrills_lucianos_toronto"]);
    expect(priceOf(t, "milk_2pct_4l", "nofrills_lucianos_toronto")!.sale).toEqual({ price: 5.99, ends: "2026-10-01" });
  });

  it("refuses what would quietly corrupt prices", () => {
    expect(() => build([["statcan", statcan]], current.version)).toThrow(/must be later/);
    const clash = manualRecords([{ item_id: "milk_2pct_1l", store: "ca_typical", price: 3, sale: null, source: "x", source_detail: "", date: "2026-09-20" }]);
    expect(() => build([["statcan", statcan], ["manual", clash]])).toThrow(/'milk_2pct_1l' at 'ca_typical' comes from both statcan and manual/);
    const unknownItem = manualRecords([{ item_id: "nope", store: "ca_typical", price: 3, sale: null, source: "x", source_detail: "", date: "2026-09-20" }]);
    expect(() => build([["manual", unknownItem]])).toThrow(/isn't in the price table/);
    const unknownStore = manualRecords([{ item_id: "salt_1kg", store: "costco", price: 3, sale: null, source: "x", source_detail: "", date: "2026-09-20" }]);
    expect(() => build([["manual", unknownStore]])).toThrow(/unknown store 'costco'/);
  });

  it("the result loads, and coverage counts items with a real price", () => {
    const v = vocabulary.withTable(build([["statcan", statcan], ["manual", canola]]));
    expect(v.version).toBe("2026-09-25");
    const c = coverage(v);
    expect(c.items).toMatchObject({ statcan: 63, manual: 1, real: 64, placeholder: 132, total: 196 });
    // Canola was the one item in cooking_oil the list asked for, so the group now has a real price.
    expect(c.placeholderGroups).not.toContain("cooking_oil");
    expect(c.groups.placeholder).toBe(74);
  });
});

describe("manual-prices.csv", () => {
  const header = MANUAL_COLUMNS.join(",");
  const row = (o: Partial<Record<(typeof MANUAL_COLUMNS)[number], string>>) => MANUAL_COLUMNS.map((c) => o[c] ?? "").join(",");
  const STORES = new Set(["ca_typical", "shop"]);
  const ok = { store: "shop", price: "3.49", source: "Shop", date: "2026-09-20" };

  it("counts a row only when store, price, source and date are all there", () => {
    const text = [header, row({ item_id: "a", ...ok }), row({ item_id: "b" })].join("\n");
    const r = readManual(text, "2026-09-25", STORES);
    expect(r.errors).toEqual([]);
    expect(r.prices).toEqual([{ item_id: "a", store: "shop", price: 3.49, sale: null, source: "Shop", source_detail: "", date: "2026-09-20" }]);
  });

  it("reads a sale with its end date", () => {
    const r = readManual([header, row({ item_id: "a", ...ok, sale_price: "2.99", sale_ends: "2026-10-01" })].join("\n"), "2026-09-25", STORES);
    expect(r.prices[0]!.sale).toEqual({ price: 2.99, ends: "2026-10-01" });
  });

  it("names half-filled rows, bad prices, bad dates, unknown stores and bad sales by line", () => {
    const text = [
      header,
      row({ item_id: "a", price: "2.29" }),
      row({ item_id: "b", ...ok, price: "abc" }),
      row({ item_id: "c", ...ok, date: "20/09/2026" }),
      row({ item_id: "d", ...ok, date: "2026-12-01" }),
      row({ item_id: "e", ...ok, store: "costco" }),
      row({ item_id: "f", ...ok, sale_price: "2.99" }),
      row({ item_id: "g", ...ok, sale_price: "3.99", sale_ends: "2026-10-01" }),
      row({ item_id: "h", ...ok, sale_price: "2.99", sale_ends: "2026-09-01" }),
      row({ item_id: "a" }),
    ].join("\n");
    expect(readManual(text, "2026-09-25", STORES).errors).toEqual([
      "line 2 (a): missing store, source, date",
      "line 3 (b): price 'abc' should be dollars like 3.49",
      "line 4 (c): date '20/09/2026' should be YYYY-MM-DD",
      "line 5 (d): date 2026-12-01 is in the future",
      "line 6 (e): unknown store 'costco'; add it to stores.json first",
      "line 7 (f): a sale needs both sale_price and sale_ends",
      "line 8 (g): sale_price '3.99' should be below the regular price",
      "line 9 (h): sale_ends '2026-09-01' should be a YYYY-MM-DD on or after the date seen",
      "line 10: 'a' appears twice",
    ]);
  });

  it("keeps commas and quotes in fields intact through a round trip", () => {
    const r = readManual([header, row({ item_id: "a", ...ok, source: '"Walmart, Scarborough"', source_detail: '"said ""rollback"""' })].join("\n"), "2026-09-25", STORES);
    expect(r.prices[0]).toMatchObject({ source: "Walmart, Scarborough", source_detail: 'said "rollback"' });
    expect(parseCsv(writeManual(r.rows))[1]).toEqual(["", "a", "", "", "", "shop", "3.49", "", "", "Walmart, Scarborough", 'said "rollback"', "2026-09-20", ""]);
  });

  it("the committed CSV reads cleanly, with the canola oil price as row 1", () => {
    const r = readManual(readFileSync(new URL("../manual-prices.csv", import.meta.url), "utf8"), "2026-09-25", new Set(stores.map((s: { id: string }) => s.id)));
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ rank: "1", item_id: "canola_oil_946ml", store: "nofrills_lucianos_toronto", price: "4.29", date: "2026-09-25" });
  });
});

describe("fill order", () => {
  const v = vocabulary.withTable(build());
  const ranked = rankPlaceholders(v);

  it("lists every item without a real price once", () => {
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
    const blank = Object.fromEntries(MANUAL_COLUMNS.map((c) => [c, ""])) as Record<(typeof MANUAL_COLUMNS)[number], string>;
    const rows = manualRows(v, [{ ...blank, rank: "9", item_id: "salt_1kg", store: "nofrills_lucianos_toronto", price: "1.79", source: "No Frills", date: "2026-09-20" }]);
    expect(rows.find((r) => r.item_id === "salt_1kg")).toMatchObject({ price: "1.79", store: "nofrills_lucianos_toronto", date: "2026-09-20", rank: "2" });
  });
});
