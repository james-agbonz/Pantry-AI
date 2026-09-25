import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, Limiter, memoryKV, type Reservation } from "../src/limits";

/** A limiter on a fake clock, starting at noon UTC on 2026-09-25. */
function setup(config = DEFAULT_LIMITS) {
  let now = Date.parse("2026-09-25T12:00:00Z");
  const kv = memoryKV();
  const limiter = new Limiter(kv, config, () => new Date(now));
  return {
    limiter,
    kv,
    advance: (ms: number) => void (now += ms),
    deal: (device: string, localDate = "2026-09-25", ip = "1.2.3.4") => limiter.reserve({ device, ip, localDate }),
  };
}
const MINUTE = 60_000;
const DAY = 86_400_000;
const reasons = (rs: { ok: boolean; reason?: string }[]) => rs.map((r) => (r.ok ? "ok" : r.reason));

describe("three decks a day per device", () => {
  it("allows three, refuses the fourth, and starts again the next day", async () => {
    const t = setup();
    const out = [];
    for (let i = 0; i < 4; i++) {
      out.push(await t.deal("device-aaaaaaaaaaaa"));
      t.advance(MINUTE);
    }
    expect(reasons(out)).toEqual(["ok", "ok", "ok", "daily_limit"]);
    expect(out[3]).toMatchObject({ status: 429 });
    t.advance(DAY);
    expect((await t.deal("device-aaaaaaaaaaaa", "2026-09-26")).ok).toBe(true);
  });

  it("says how many are left", async () => {
    const t = setup();
    expect(await t.deal("device-aaaaaaaaaaaa")).toMatchObject({ ok: true, left: 2 });
  });
});

describe("a device's date only moves forward", () => {
  it("claiming yesterday after using today's three still counts against today", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) {
      await t.deal("device-aaaaaaaaaaaa", "2026-09-25");
      t.advance(MINUTE);
    }
    expect(await t.deal("device-aaaaaaaaaaaa", "2026-09-24")).toMatchObject({ ok: false, reason: "daily_limit" });
  });

  it("so the ±1 day window gives three decks a day, not nine", async () => {
    const t = setup();
    const out = [];
    // Tomorrow first, then today and yesterday: all three land on tomorrow.
    for (const day of ["2026-09-26", "2026-09-25", "2026-09-24", "2026-09-26", "2026-09-25"]) {
      out.push(await t.deal("device-aaaaaaaaaaaa", day));
      t.advance(MINUTE);
    }
    expect(reasons(out)).toEqual(["ok", "ok", "ok", "daily_limit", "daily_limit"]);
    expect(out.filter((r) => r.ok).map((r) => (r as Reservation).day)).toEqual(["2026-09-26", "2026-09-26", "2026-09-26"]);
  });

  it("a date outside a day either side of the server's is refused", async () => {
    const t = setup();
    expect(await t.deal("device-aaaaaaaaaaaa", "2026-09-27")).toMatchObject({ ok: false, status: 400, reason: "bad_date" });
    expect(await t.deal("device-aaaaaaaaaaaa", "2026-09-23")).toMatchObject({ ok: false, reason: "bad_date" });
    expect(await t.deal("device-aaaaaaaaaaaa", "Sept 25")).toMatchObject({ ok: false, reason: "bad_date" });
  });
});

describe("per-IP limits", () => {
  it("a burst of more than five a minute from one IP is refused, then allowed the next minute", async () => {
    const t = setup();
    const out = [];
    for (let i = 0; i < 6; i++) out.push(await t.deal(`device-${String(i).padStart(12, "0")}`));
    expect(reasons(out)).toEqual(["ok", "ok", "ok", "ok", "ok", "rate_limit"]);
    t.advance(MINUTE);
    expect((await t.deal("device-999999999999")).ok).toBe(true);
  });

  it("the daily cap is a high tripwire: a campus of 60 students behind one IP all get their three", async () => {
    const t = setup();
    let ok = 0;
    for (let s = 0; s < 60; s++) {
      for (let d = 0; d < 3; d++) {
        if ((await t.deal(`student-${String(s).padStart(10, "0")}`)).ok) ok++;
        t.advance(15_000); // 4 a minute: under the burst limit.
      }
    }
    expect(ok).toBe(180);
  });

  it("the tripwire trips at 200 decks from one IP in a day", async () => {
    const t = setup();
    const out = [];
    for (let i = 0; i < 201; i++) {
      out.push(await t.deal(`device-${String(i).padStart(12, "0")}`));
      t.advance(15_000);
    }
    expect(out.slice(0, 200).every((r) => r.ok)).toBe(true);
    expect(out[200]).toMatchObject({ ok: false, status: 429, reason: "rate_limit" });
  });
});

describe("global circuit breaker", () => {
  it("refuses with busy once the day's cap is reached", async () => {
    const t = setup({ ...DEFAULT_LIMITS, globalPerDay: 2 });
    const out = [await t.deal("device-aaaaaaaaaaaa", "2026-09-25", "1.1.1.1"), await t.deal("device-bbbbbbbbbbbb", "2026-09-25", "2.2.2.2"), await t.deal("device-cccccccccccc", "2026-09-25", "3.3.3.3")];
    expect(reasons(out)).toEqual(["ok", "ok", "busy"]);
    expect(out[2]).toMatchObject({ status: 503 });
  });
});

describe("release", () => {
  it("gives the slot back for the device, the IP and the day, but not the burst count", async () => {
    const t = setup();
    const r = (await t.deal("device-aaaaaaaaaaaa")) as Reservation;
    await t.limiter.release(r);
    for (let i = 0; i < 3; i++) expect((await t.deal("device-aaaaaaaaaaaa")).ok).toBe(true);
    // 5 attempts this minute already (1 + 3 here + this one): the burst limit didn't forget the first.
    expect((await t.deal("device-bbbbbbbbbbbb")).ok).toBe(true);
    expect(await t.deal("device-cccccccccccc")).toMatchObject({ reason: "rate_limit" });
  });
});

describe("prune", () => {
  it("drops counters from before yesterday and keeps the rest", async () => {
    const t = setup();
    await t.deal("device-aaaaaaaaaaaa");
    t.advance(3 * DAY);
    await t.deal("device-aaaaaaaaaaaa", "2026-09-28");
    const removed = await t.limiter.prune();
    expect(removed).toBeGreaterThan(0);
    expect(Object.keys(t.kv.dump()).some((k) => k.includes("2026-09-25"))).toBe(false);
    expect(Object.keys(t.kv.dump()).some((k) => k.includes("2026-09-28"))).toBe(true);
  });
});
