import { describe, expect, it } from "vitest";
import { kvReportStore, type Report } from "../src";

describe("kvReportStore", () => {
  it("puts each report under report:<time>:<id>, oldest first, and lets KV delete it after the configured days", async () => {
    const puts: [string, string, unknown][] = [];
    const store = kvReportStore({ put: async (k, v, o) => void puts.push([k, v, o]) }, { ttlDays: 365, id: () => "abc" });
    const r: Report = { at: "2026-11-04T17:00:00.000Z", device: "device-0123456789abcdef", platform: "android", app_version: "0.1.0", message: "Crash on the meal screen" };
    await store.save(r);
    expect(puts).toEqual([["report:2026-11-04T17:00:00.000Z:abc", JSON.stringify(r), { expirationTtl: 365 * 86_400 }]]);
  });
});
