import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sameSize, score, sizeOf } from "../src/find";
import { applyPicks } from "../src/pick";
import { collectStore, shelfRecord } from "../src/sources/store";
import { giantTigerShelf, StoreMap, walmartBrowseItems, walmartShelf, type Shelf } from "../src/stores";
import { allowed, politeClient, Refused, robotsRules, userAgent, type Fetch } from "../src/web";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

/** A fake web: answers by URL, records every request and its User-Agent. */
function fakeWeb(pages: Record<string, { status?: number; body: string }>) {
  const calls: { url: string; agent: string }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, agent: init.headers["User-Agent"]! });
    const page = pages[url] ?? (url.endsWith("/robots.txt") ? { body: "" } : { status: 404, body: "" });
    const status = page.status ?? 200;
    return { ok: status < 400, status, text: async () => page.body, arrayBuffer: async () => new TextEncoder().encode(page.body).buffer as ArrayBuffer };
  };
  return { calls, web: politeClient({ fetch, gapMs: 0, agent: "PantryPriceBot/0.1" }) };
}

describe("robots.txt", () => {
  const rules = robotsRules(`User-agent: *\nDisallow: /cart/\nDisallow: */search\nDisallow: *keywords=*\nAllow: /cart/help\n\nUser-agent: MJ12bot\nDisallow: /`);

  it("keeps out of what the * group disallows, and lets the longest rule win", () => {
    expect(allowed(rules, "/en/ip/rice/123")).toBe(true);
    expect(allowed(rules, "/cart/")).toBe(false);
    expect(allowed(rules, "/cart/help")).toBe(true);
    expect(allowed(rules, "/en/search")).toBe(false);
    expect(allowed(rules, "/aisles?keywords=rice")).toBe(false);
  });

  it("follows a group that names the collector instead of *", () => {
    const own = robotsRules(`User-agent: *\nDisallow:\n\nUser-agent: PantryPriceBot\nDisallow: /`);
    expect(allowed(own, "/anything")).toBe(false);
    expect(allowed(robotsRules(`User-agent: *\nDisallow:`), "/anything")).toBe(true);
  });
});

describe("the polite client", () => {
  it("says who it is, with a contact only when one is set", () => {
    expect(userAgent("")).toBe("PantryPriceBot/0.1");
    expect(userAgent("https://example.org/bot")).toBe("PantryPriceBot/0.1 (+https://example.org/bot)");
  });

  it("reads robots.txt first and refuses a disallowed page without asking for it", async () => {
    const { web, calls } = fakeWeb({ "https://shop.test/robots.txt": { body: "User-agent: *\nDisallow: /search" } });
    await expect(web.get("https://shop.test/search?q=rice")).rejects.toBeInstanceOf(Refused);
    expect(calls.map((c) => c.url)).toEqual(["https://shop.test/robots.txt"]);
    expect(calls[0]!.agent).toBe("PantryPriceBot/0.1");
  });

  it("on a 429, waits what the site asks and tries once more", async () => {
    let n = 0;
    const waits: number[] = [];
    const fetch: Fetch = async (url) => {
      if (url.endsWith("/robots.txt")) return { ok: true, status: 200, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
      n++;
      return n === 1
        ? { ok: false, status: 429, headers: { get: () => "7" }, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) }
        : { ok: true, status: 200, text: async () => "ok", arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const web = politeClient({ fetch, gapMs: 0, sleep: async (ms) => void waits.push(ms) });
    expect(await web.get("https://shop.test/a")).toBe("ok");
    expect(waits).toContain(7000);
  });

  it("treats a 412 (a bot check) as a refusal too", async () => {
    const { web } = fakeWeb({ "https://shop.test/a": { status: 412, body: "" } });
    await expect(web.get("https://shop.test/a")).rejects.toMatchObject({ why: "HTTP 412" });
  });

  it("stops asking a site after a 403 or 429, for the rest of the run", async () => {
    const { web, calls } = fakeWeb({ "https://shop.test/a": { status: 403, body: "" }, "https://shop.test/b": { body: "ok" } });
    await expect(web.get("https://shop.test/a")).rejects.toMatchObject({ why: "HTTP 403" });
    await expect(web.get("https://shop.test/b")).rejects.toMatchObject({ why: "refused earlier this run" });
    expect(calls.filter((c) => c.url === "https://shop.test/b")).toEqual([]);
  });

  it("waits between requests to one site", async () => {
    const waits: number[] = [];
    const fetch: Fetch = async () => ({ ok: true, status: 200, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) });
    const web = politeClient({ fetch, gapMs: 1000, sleep: async (ms) => void waits.push(ms) });
    await web.get("https://shop.test/a");
    await web.get("https://shop.test/b");
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(waits.every((w) => w > 0 && w <= 1000)).toBe(true);
  });
});

describe("store pages (trimmed real responses, 2026-11-05)", () => {
  it("Walmart: name, the current price and the was-price from the product page", async () => {
    const { web } = fakeWeb({ "https://www.walmart.ca/en/ip/x/6000197212371": { body: fixture("walmart-product.html") } });
    expect(await walmartShelf(web, "/en/ip/x/6000197212371")).toEqual({ name: "Green Giant Riced Veggies Cauliflower Medley, 340 g", price: 3.47, was: 3.97, inStock: true });
  });

  it("Walmart: a page without product data (a check page) is an error, not a price", async () => {
    const { web } = fakeWeb({ "https://www.walmart.ca/en/ip/x/1": { body: "<html><body>Are you a robot?</body></html>" } });
    await expect(walmartShelf(web, "/en/ip/x/1")).rejects.toThrow(/no page data/);
  });

  it("Walmart: browse-page cards become candidates, with the path stripped of tracking", () => {
    expect(walmartBrowseItems(fixture("walmart-browse.html"))[0]).toEqual({
      name: "Green Giant Riced Veggies Cauliflower Medley, 340 g",
      price: 3.47,
      ref: "/en/ip/Green-Giant-Riced-Veggies-Cauliflower-Medley-340-g/6000197212371",
    });
  });

  it("Giant Tiger: Shopify's public product data, cents to dollars, no was-price when not on sale", async () => {
    const { web } = fakeWeb({ "https://www.gianttiger.com/products/twizzlers-black-licorice-twists-375g.js": { body: fixture("gianttiger-product.json") } });
    expect(await giantTigerShelf(web, "twizzlers-black-licorice-twists-375g")).toEqual({ name: "Twizzlers Licorice Twists Candy, 375-g", price: 3.77, was: null, inStock: true });
  });
});

describe("shelf readings as prices", () => {
  const shelf = (s: Partial<Shelf>): Shelf => ({ name: "Rice, 2 kg", price: 5, was: null, inStock: true, ...s });

  it("a regular price is the regular price, dated today", () => {
    expect(shelfRecord("rice_white_2kg", "walmart_ca", shelf({}), "2026-11-05")).toEqual({ item: "rice_white_2kg", store: "walmart_ca", regular: 5, sale: null, source: "store", updated: "2026-11-05" });
  });

  it("on sale, the was-price is regular and the sale lasts only until the next weekly run", () => {
    expect(shelfRecord("rice_white_2kg", "walmart_ca", shelf({ price: 3.47, was: 3.97 }), "2026-11-05")).toMatchObject({ regular: 3.97, sale: { price: 3.47, ends: "2026-11-11" } });
  });

  it("collecting a store skips out-of-stock items and stops at the first refusal", async () => {
    const entries = { a: { ref: "a", product: "A" }, b: { ref: "b", product: "B" }, c: { ref: "c", product: "C" }, d: { ref: "d", product: "D" } };
    const { web } = fakeWeb({});
    const asked: string[] = [];
    const run = await collectStore("walmart_ca", entries, web, "2026-11-05", async (_w, ref) => {
      asked.push(ref);
      if (ref === "b") return shelf({ inStock: false });
      if (ref === "c") throw new Refused("https://www.walmart.ca/x", "HTTP 403");
      return shelf({});
    });
    expect(asked).toEqual(["a", "b", "c"]);
    expect(run.records.map((r) => r.item)).toEqual(["a"]);
    expect(run.missed).toEqual([
      { item: "b", why: "out of stock" },
      { item: "c", why: "store refused: HTTP 403" },
      { item: "d", why: "store refused: HTTP 403" },
    ]);
  });
});

describe("finding and picking products", () => {
  it("reads sizes the way stores write them", () => {
    expect(sizeOf("Dainty Royal Rice, 900-g")).toEqual({ amount: 900, kind: "g" });
    expect(sizeOf("Ben's Original Rice, 2.2 kg")).toEqual({ amount: 2200, kind: "g" });
    expect(sizeOf("Canola Oil 946 mL")).toEqual({ amount: 946, kind: "ml" });
    expect(sizeOf("Tortillas, 10 pack")).toEqual({ amount: 10, kind: "count" });
  });

  it("matches only the item's own size, within store rounding", () => {
    expect(sameSize("900g", "Dainty Royal Rice, 900-g")).toBe(true);
    expect(sameSize("946ml", "Canola oil, 950 mL")).toBe(true);
    expect(sameSize("2kg", "Ben's Original Rice, 2.2 kg")).toBe(false);
    expect(sameSize("540ml", "Chickpeas, 540 g")).toBe(false);
  });

  it("scores by the item's words in the product name", () => {
    expect(score({ name: "Black beans, canned" }, "Unico Black Beans 540 mL")).toBe(1);
    expect(score({ name: "White rice, long grain" }, "Kitchen 88 White Rice - 150g")).toBe(0.5);
  });

  const map = StoreMap.parse({ _about: "", stores: { walmart_ca: {}, gianttiger_ca: {} } });
  const row = (store: string, item: string, pick: string, product: string, ref: string) => [store, item, "", "", pick, "yes", "1.00", product, "1.00", ref];

  it("copies picked rows into the map and drops that item's other candidates", () => {
    const { map: next, rest, picked } = applyPicks(map, [
      row("gianttiger_ca", "rice_white_900g", "x", "Dainty Royal Rice, 900-g", "dainty-royal-rice-900-g"),
      row("gianttiger_ca", "rice_white_900g", "", "Minute Rice 700g", "minute"),
      row("walmart_ca", "rice_white_900g", "", "Great Value Rice 900 g", "/en/ip/gv/1"),
    ]);
    expect(picked).toBe(1);
    expect(next.stores.gianttiger_ca).toEqual({ rice_white_900g: { ref: "dainty-royal-rice-900-g", product: "Dainty Royal Rice, 900-g" } });
    expect(rest.map((r) => r[0])).toEqual(["walmart_ca"]);
  });

  it("refuses two picks for one item, or an item the table doesn't have", () => {
    expect(() => applyPicks(map, [row("walmart_ca", "rice_white_900g", "x", "A", "/a"), row("walmart_ca", "rice_white_900g", "x", "B", "/b")])).toThrow(/picked twice/);
    expect(() => applyPicks(map, [row("walmart_ca", "caviar", "x", "A", "/a")])).toThrow(/unknown item/);
  });
});

describe("StatCan provincial averages", () => {
  it("price each mapped item at its province's average store, skipping provinces with no figure", async () => {
    const { provinceRecords, provinceStore } = await import("../src/sources/statcan");
    const map = { rice_white_2kg: { product: "White rice, 2 kilograms", vector: 1458869937, basis: "exact" as const }, chicken_kg: { product: "Chicken, per kilogram", vector: 99, basis: "per_kg" as const, kg: 1.5 } };
    const recs = provinceRecords(map, [
      { vector: 1458869937, province: "ON", period: "2026-09-01", value: 39.56 },
      { vector: 1458869937, province: "YT", period: "2026-09-01", value: null },
      { vector: 99, province: "BC", period: "2026-09-01", value: 10 },
    ]);
    expect(provinceStore("ON")).toBe("statcan_on");
    expect(recs).toEqual([
      { item: "rice_white_2kg", store: "statcan_on", regular: 39.56, sale: null, source: "statcan", updated: "2026-09-01" },
      { item: "chicken_kg", store: "statcan_bc", regular: 15, sale: null, source: "statcan", updated: "2026-09-01" },
    ]);
  });
});

describe("Project Hammer", () => {
  it("prices mapped items from their latest point; a struck-out price is a sale; stale or out-of-stock ones are left out", async () => {
    const { hammerRecords } = await import("../src/sources/hammer");
    const entries = {
      rice_white_900g: { ref: "NoFrills1", product: "No Name Long Grain White Rice 907g" },
      spaghetti_900g: { ref: "NoFrills2", product: "No Name Spaghetti 900g" },
      salt_1kg: { ref: "NoFrills3", product: "Salt 1kg" },
      sugar_white_2kg: { ref: "NoFrills4", product: "Sugar 2kg" },
      honey_500g: { ref: "NoFrills5", product: "Honey 500g" },
    };
    const latest = new Map([
      ["NoFrills1", { date: "2026-11-04", price: 3.29, old: null, other: "" }],
      ["NoFrills2", { date: "2026-11-03", price: 1.5, old: 2.0, other: "SALE" }],
      ["NoFrills3", { date: "2026-10-01", price: 1.29, old: null, other: "" }],
      ["NoFrills4", { date: "2026-11-04", price: 2.99, old: null, other: "Out of stock" }],
    ]);
    const run = hammerRecords("hammer_nofrills_toronto", entries, latest, "2026-11-05");
    expect(run.records).toEqual([
      { item: "rice_white_900g", store: "hammer_nofrills_toronto", regular: 3.29, sale: null, source: "store", updated: "2026-11-04" },
      { item: "spaghetti_900g", store: "hammer_nofrills_toronto", regular: 2, sale: { price: 1.5, ends: "2026-11-11" }, source: "store", updated: "2026-11-03" },
    ]);
    expect(run.missed).toEqual([
      { item: "salt_1kg", why: "last seen 2026-10-01" },
      { item: "sugar_white_2kg", why: "out of stock" },
      { item: "honey_500g", why: "not in the dataset" },
    ]);
  });

  it("is off unless PRICE_SOURCES names it, and its stores apply in Ontario only", () => {
    const stores = JSON.parse(readFileSync(new URL("../stores.json", import.meta.url), "utf8")).stores as { id: string; provinces?: string[] }[];
    for (const s of stores.filter((x) => x.id.startsWith("hammer_"))) expect(s.provinces).toEqual(["ON"]);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts.weekly).not.toMatch(/hammer/);
  });
});
