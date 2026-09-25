import type { Profile, Session } from "@pantry/contract";
import { RecordedLlm, type LlmClient } from "@pantry/engine";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { createApp, createLlm, currentPriceTable, DEFAULT_LIMITS, Limiter, memoryKV } from "../src";

const SECRET = "sk-ant-api03-TEST-SECRET-KEY-0123456789";
const profile: Profile = { goal: "eat_well", condition: null, limits: ["no_pork"], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: null };
const session: Session = { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] };
const body = { profile, session, local_date: "2026-09-25" };
const DEVICE = "device-0123456789abcdef";

function setup(llm: LlmClient = createLlm({ provider: "mock", model: "sample-deck" })) {
  const logs: string[] = [];
  const limiter = new Limiter(memoryKV(), DEFAULT_LIMITS, () => new Date("2026-09-25T12:00:00Z"));
  const app = createApp({
    llm,
    vocabulary: () => vocabulary,
    priceTable: currentPriceTable,
    limits: limiter,
    log: (e) => logs.push(JSON.stringify(e)),
    secrets: [SECRET],
  });
  const deck = (init: { device?: string | null; ip?: string; json?: unknown } = {}) =>
    app.request("/api/deck", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": init.ip ?? "1.2.3.4",
        ...(init.device === null ? {} : { "X-Pantry-Device": init.device ?? DEVICE }),
      },
      body: JSON.stringify(init.json ?? body),
    });
  return { app, deck, logs, limiter };
}

/** Reads the whole NDJSON stream. */
const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));

describe("GET /api/prices", () => {
  it("serves the current table with its version as the ETag, and 304 when unchanged", async () => {
    const { app } = setup();
    const res = await app.request("/api/prices");
    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toBe(`"${currentPriceTable().version}"`);
    expect((await res.json()).schema).toBe(2);
    const again = await app.request("/api/prices", { headers: { "If-None-Match": etag! } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });
});

describe("POST /api/deck", () => {
  it("streams the four stages in order, then the priced deck", async () => {
    const { deck } = setup();
    const res = await deck();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    const out = await lines(res);
    expect(out.slice(0, 4)).toEqual([{ stage: "reading" }, { stage: "building" }, { stage: "pricing" }, { stage: "sorting" }]);
    expect(out[4].deck).toHaveLength(6);
    expect(out[4].deck[0].pricing.budget).toBe(15);
    expect(out[4].left).toBe(2);
  });

  it("refuses a missing or malformed device ID, and a bad body, naming the field", async () => {
    const { deck } = setup();
    expect((await deck({ device: null })).status).toBe(400);
    expect(await (await deck({ device: "x" })).json()).toEqual({ error: "bad_request", field: "X-Pantry-Device" });
    const bad = await deck({ json: { ...body, session: { ...session, budget: -5 } } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad_request", field: "session.budget" });
  });

  it("refuses the fourth deck of the day from one device with 429 daily_limit", async () => {
    const { deck } = setup();
    for (let i = 0; i < 3; i++) await lines(await deck({ ip: `10.0.0.${i}` }));
    const fourth = await deck({ ip: "10.0.0.9" });
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({ error: "daily_limit" });
  });

  it("a model error is the server's failure: the slot comes back", async () => {
    const failing: LlmClient = { provider: "test", model: "down", complete: async () => { throw new Error("529 overloaded"); } };
    const { deck, logs } = setup(failing);
    expect(await lines(await deck())).toEqual([{ stage: "reading" }, { error: "server" }]);
    expect(logs.some((l) => /"deck_failed".*"released":true/.test(l))).toBe(true);
  });

  it("every card dropped is the server's failure too: the slot comes back", async () => {
    const garbage = new RecordedLlm(["not json at all"], { loop: true });
    const { deck, logs } = setup(garbage);
    const out = await lines(await deck());
    expect(out.at(-1)).toEqual({ error: "no_cards" });
    expect(logs.some((l) => /"deck_failed".*"reason":"no_cards".*"released":true/.test(l))).toBe(true);
  });

  it("released slots really are free: three failures, then three good decks", async () => {
    let fail = true;
    const sometimes: LlmClient = {
      provider: "test",
      model: "flaky",
      complete: async (req) => {
        if (fail) throw new Error("timeout");
        return createLlm({ provider: "mock", model: "sample-deck" }).complete(req);
      },
    };
    const { deck } = setup(sometimes);
    for (let i = 0; i < 3; i++) expect((await lines(await deck({ ip: `10.0.2.${i}` }))).at(-1)).toEqual({ error: "server" });
    fail = false;
    for (let i = 0; i < 3; i++) expect((await lines(await deck({ ip: `10.0.3.${i}` }))).at(-1).deck).toHaveLength(6);
    expect((await deck({ ip: "10.0.4.1" })).status).toBe(429);
  });

  it("a phone that disconnects mid-deal still uses its slot: the model cost is spent", async () => {
    // The model answers only when the test says so, so the phone really leaves before the deck exists.
    const gates: (() => void)[] = [];
    const mock = createLlm({ provider: "mock", model: "sample-deck" });
    const slow: LlmClient = {
      provider: "test",
      model: "slow",
      complete: async (req) => {
        await new Promise<void>((r) => gates.push(r));
        return mock.complete(req);
      },
    };
    const { deck, logs } = setup(slow);
    for (let i = 0; i < 3; i++) {
      const res = await deck({ ip: `10.0.5.${i}` });
      const reader = res.body!.getReader();
      expect(JSON.parse(new TextDecoder().decode((await reader.read()).value))).toEqual({ stage: "reading" });
      await reader.cancel(); // The phone is gone; the model call is still running.
    }
    for (const open of gates.splice(0)) open(); // Now the model answers.
    for (let i = 0; i < 200 && logs.filter((l) => /deck_dealt/.test(l)).length < 3; i++) await new Promise((r) => setTimeout(r, 10));
    expect(logs.filter((l) => /deck_dealt/.test(l))).toHaveLength(3);
    expect(logs.filter((l) => /released/.test(l))).toEqual([]);
    const fourth = await deck({ ip: "10.0.5.9" });
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({ error: "daily_limit" });
  });

  it("never puts the API key in a response or a log line, even when an error message carries it", async () => {
    const leaky: LlmClient = { provider: "test", model: "leaky", complete: async () => { throw new Error(`auth failed for key ${SECRET}`); } };
    const { deck, logs, app } = setup(leaky);
    const text = await (await deck()).text();
    const health = await (await app.request("/api/health")).text();
    const prices = await (await app.request("/api/prices")).text();
    for (const out of [text, health, prices, ...logs]) expect(out).not.toContain(SECRET);
    expect(logs.join("\n")).toContain("[redacted]");
  });
});

describe("GET /api/health and unknown routes", () => {
  it("reports the price table version, and 404s the rest as JSON", async () => {
    const { app } = setup();
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true, prices: currentPriceTable().version });
    const nf = await app.request("/api/nope");
    expect(nf.status).toBe(404);
    expect(await nf.json()).toEqual({ error: "not_found" });
  });
});
