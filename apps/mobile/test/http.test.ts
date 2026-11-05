import type { Profile, Session } from "@pantry/contract";
import { createApp, createLlm, currentPriceTable, DEFAULT_LIMITS, Limiter, memoryKV, memoryReportStore } from "@pantry/backend";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { httpDeckSource, httpImageSource, httpPriceTableSource, httpReportSource, readDeckStream, type Fetch } from "../src/data/http";
import { DealError, ReportError } from "../src/data/sources";

// The phone's HTTP client against the real server app, in process: the two
// sides of /api/deck and /api/prices have to agree.
const profile: Profile = { goal: "eat_well", condition: null, limits: [], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: null };
const session: Session = { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] };
const TODAY = "2026-09-25";

function server() {
  const app = createApp({
    llm: createLlm({ provider: "mock", model: "sample-deck" }),
    vocabulary: () => vocabulary,
    priceTable: currentPriceTable,
    limits: new Limiter(memoryKV(), DEFAULT_LIMITS, () => new Date(`${TODAY}T12:00:00Z`)),
    log: () => {},
  });
  let ip = 0;
  // Each call from its own IP, so these tests hit the device limit, not the burst limit.
  const fetchImpl: Fetch = async (url, init) =>
    app.request(url.replace("http://api", ""), { ...init, headers: { ...init?.headers, "CF-Connecting-IP": `10.9.0.${ip++}` } }) as never;
  return { fetchImpl };
}

describe("the phone's deck client against the server", () => {
  it("hears every stage and gets a checked, priced deck with decks left", async () => {
    const { fetchImpl } = server();
    const src = httpDeckSource("http://api", async () => "device-phone-0000000001", () => TODAY, fetchImpl);
    const stages: string[] = [];
    const dealt = await src.deal(profile, session, { onStage: (s) => stages.push(s) });
    expect(stages).toEqual(["reading", "building", "pricing", "sorting"]);
    expect(dealt.cards).toHaveLength(6);
    expect(dealt.left).toBe(2);
  });

  it("turns the fourth deck into DealError daily_limit", async () => {
    const { fetchImpl } = server();
    const src = httpDeckSource("http://api", async () => "device-phone-0000000002", () => TODAY, fetchImpl);
    for (let i = 0; i < 3; i++) await src.deal(profile, session);
    await expect(src.deal(profile, session)).rejects.toMatchObject({ reason: "daily_limit" });
  });

  it("a connection that can't be made, or drops before the deck, is 'network'", async () => {
    const down: Fetch = async () => {
      throw new TypeError("Network request failed");
    };
    await expect(httpDeckSource("http://api", async () => "device-phone-0000000003", () => TODAY, down).deal(profile, session)).rejects.toMatchObject({ reason: "network" });
    const cut = () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"stage":"reading"}\n{"stage":"buil'));
          c.close();
        },
      });
    await expect(readDeckStream(cut())).rejects.toMatchObject({ reason: "network" });
    await expect(readDeckStream(cut())).rejects.toBeInstanceOf(DealError);
  });

  it("a whole line the server shouldn't send is a server error, not a crash", async () => {
    const junk = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"stage":"reading"}\n{"surprise":true}\n'));
        c.close();
      },
    });
    await expect(readDeckStream(junk)).rejects.toMatchObject({ reason: "server" });
  });

  it("a line split across chunks still reads", async () => {
    const { fetchImpl } = server();
    const res = await fetchImpl("http://api/api/deck", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pantry-Device": "device-phone-0000000004" },
      body: JSON.stringify({ profile, session, local_date: TODAY }),
    });
    const whole = await res.text();
    const bytes = new TextEncoder().encode(whole);
    const trickle = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    expect((await readDeckStream(trickle)).cards).toHaveLength(6);
  });
});

describe("the phone's price client against the server", () => {
  it("gets the table, then a 304 as 'unchanged' once it has that version", async () => {
    const { fetchImpl } = server();
    const src = httpPriceTableSource("http://api", fetchImpl);
    const table = (await src.fetch()) as { version: string; schema: number };
    expect(table.schema).toBe(2);
    expect(await src.fetch(table.version)).toBeUndefined();
    expect(await src.fetch("2026-01-01")).toMatchObject({ version: table.version });
  });
});

describe("the phone's report client against the server", () => {
  function reportServer() {
    const store = memoryReportStore();
    const app = createApp({
      llm: createLlm({ provider: "mock", model: "sample-deck" }),
      vocabulary: () => vocabulary,
      priceTable: currentPriceTable,
      limits: new Limiter(memoryKV(), DEFAULT_LIMITS, () => new Date(`${TODAY}T12:00:00Z`)),
      reports: store,
      log: () => {},
    });
    const fetchImpl: Fetch = async (url, init) => app.request(url.replace("http://api", ""), { ...init, headers: { ...init?.headers, "CF-Connecting-IP": "10.8.0.1" } }) as never;
    const source = httpReportSource("http://api", async () => "device-0123456789abcdef", { version: "0.1.0", platform: "ios" }, fetchImpl);
    return { store, source };
  }

  it("sends the message with the app version and platform, and the server keeps it", async () => {
    const { store, source } = reportServer();
    await source.send("The tuna card had pork in it");
    expect(store.reports).toEqual([expect.objectContaining({ message: "The tuna card had pork in it", app_version: "0.1.0", platform: "ios", device: "device-0123456789abcdef" })]);
  });

  it("says rate_limit after three in a minute, and network when the server can't be reached", async () => {
    const { source } = reportServer();
    for (let i = 0; i < 3; i++) await source.send(`report ${i}`);
    await expect(source.send("one more")).rejects.toEqual(new ReportError("rate_limit"));
    const offline = httpReportSource("http://api", async () => "device-0123456789abcdef", { version: "0.1.0", platform: "ios" }, async () => {
      throw new TypeError("Network request failed");
    });
    await expect(offline.send("hi")).rejects.toEqual(new ReportError("network"));
  });
});

describe("the phone's photo client against the server", () => {
  function photoServer(generate: (prompt: string) => Promise<{ url: string } | null>) {
    const prompts: string[] = [];
    const app = createApp({
      llm: createLlm({ provider: "mock", model: "sample-deck" }),
      vocabulary: () => vocabulary,
      priceTable: currentPriceTable,
      limits: new Limiter(memoryKV(), DEFAULT_LIMITS, () => new Date(`${TODAY}T12:00:00Z`)),
      images: { provider: "test", generate: (p) => (prompts.push(p), generate(p)) },
      log: () => {},
    });
    const fetchImpl: Fetch = async (url, init) => app.request(url.replace("http://api", ""), { ...init, headers: { ...init?.headers, "CF-Connecting-IP": "10.7.0.1" } }) as never;
    return { prompts, source: httpImageSource("http://api", async () => "device-0123456789abcdef", fetchImpl) };
  }
  const card = { name: "Egg fried rice", image_prompt: "egg fried rice with corn and green onion" };

  it("sends the card's name and description, and gets the photo back", async () => {
    const { prompts, source } = photoServer(async () => ({ url: "data:image/webp;base64,UklGRg" }));
    expect(await source.load(card, 0)).toBe("data:image/webp;base64,UklGRg");
    expect(prompts[0]).toContain("Egg fried rice: egg fried rice with corn and green onion");
  });

  it("cuts text past the server's caps instead of having the photo refused", async () => {
    const { prompts, source } = photoServer(async () => ({ url: "data:image/webp;base64,AA" }));
    expect(await source.load({ name: "n".repeat(200), image_prompt: "d".repeat(2000) }, 0)).toBe("data:image/webp;base64,AA");
    expect(prompts[0]).toContain(`${"n".repeat(120)}: ${"d".repeat(1200)}`);
  });

  it("is null when the server has no photo, refuses, or can't be reached", async () => {
    expect(await photoServer(async () => null).source.load(card, 0)).toBeNull();
    const { source } = photoServer(async () => ({ url: "data:image/webp;base64,AA" }));
    for (let i = 0; i < 40; i++) await source.load(card, i);
    expect(await source.load(card, 40)).toBeNull();
    const offline = httpImageSource("http://api", async () => "device-0123456789abcdef", async () => {
      throw new TypeError("Network request failed");
    });
    expect(await offline.load(card, 0)).toBeNull();
  });
});
