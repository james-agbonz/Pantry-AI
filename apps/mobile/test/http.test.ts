import type { Profile, Session } from "@pantry/contract";
import { createApp, createLlm, currentPriceTable, DEFAULT_LIMITS, Limiter, memoryKV } from "@pantry/backend";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { httpDeckSource, httpPriceTableSource, readDeckStream, type Fetch } from "../src/data/http";
import { DealError } from "../src/data/sources";

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
