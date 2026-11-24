/**
 * Staging smoke test: one command that proves the API is up and each route
 * works, with a made-up profile (SPEC §16: free tiers get test profiles only).
 *
 *   node tools/eval/smoke.mjs [--base https://…]   (default: staging)
 *
 * Checks health, the price table, one deck (with photos for its cards), one
 * photo on its own, and one problem report, which it then deletes nothing
 * for: the report stays, marked "smoke test", so clear it with
 * `npm run reports -w @pantry/backend` if it bothers you. Exit 0 when every
 * check passes, 1 otherwise. Costs one deck and up to 7 photos of the day's
 * free allowances.
 */
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const BASE = (args[args.indexOf("--base") + 1] && args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://pantry-api-staging.jamesagbonz.workers.dev").replace(/\/$/, "");
const device = `smoke-${randomUUID()}`;
const headers = { "Content-Type": "application/json", "X-Pantry-Device": device };
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const timed = async (fn) => {
  const t = Date.now();
  const v = await fn();
  return [v, Date.now() - t];
};

try {
  const [health, hms] = await timed(() => fetch(`${BASE}/api/health`).then((r) => r.json()));
  check("health", health?.ok === true, `prices ${health?.prices}, ${hms} ms`);

  const prices = await fetch(`${BASE}/api/prices`);
  const table = await prices.json();
  check("price table", prices.ok && table?.schema === 2 && Array.isArray(table.prices), `version ${table?.version}, ${table?.prices?.length} prices`);

  const profile = { goal: "eat_well", condition: null, limits: ["no_pork"], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: null, province: "ON" };
  const session = { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] };
  const [deck, dms] = await timed(async () => {
    const res = await fetch(`${BASE}/api/deck`, { method: "POST", headers, body: JSON.stringify({ profile, session, local_date: new Date().toLocaleDateString("en-CA") }) });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    return { status: res.status, stages: lines.filter((l) => l.stage).map((l) => l.stage), final: lines.at(-1) };
  });
  const cards = deck.final?.deck ?? [];
  check("deck: four stages then cards", deck.status === 200 && deck.stages.join() === "reading,building,pricing,sorting" && cards.length > 0, `${cards.length} cards, ${deck.final?.dropped ?? "?"} dropped, ${dms} ms${deck.final?.error ? `, error ${deck.final.error}` : ""}`);
  check("deck: every card priced, no card over budget hidden", cards.every((c) => typeof c.pricing?.total === "number" && typeof c.pricing?.over_by === "number"));
  check("deck: 'uses' only what the user has", cards.every((c) => c.card.uses.every((u) => session.have.includes(u))), cards.flatMap((c) => c.card.uses.filter((u) => !session.have.includes(u))).join(", ") || "clean");

  let photos = 0;
  let pms = [];
  for (const c of cards.slice(0, 3)) {
    const [res, ms] = await timed(() => fetch(`${BASE}/api/image`, { method: "POST", headers, body: JSON.stringify({ name: c.card.name, prompt: c.card.image_prompt }) }).then((r) => r.json()));
    if (typeof res?.url === "string" && res.url.startsWith("data:image/")) photos++;
    pms.push(ms);
  }
  check("photos for the first three cards", photos === Math.min(3, cards.length), `${photos} of ${Math.min(3, cards.length)}, ${pms.join("/")} ms${photos === 0 ? "; Workers AI allowance used up?" : ""}`);

  const report = await fetch(`${BASE}/api/report`, { method: "POST", headers, body: JSON.stringify({ message: "smoke test: ignore", app_version: "0.0.0", platform: "web" }) });
  check("problem report", report.status === 201, `HTTP ${report.status}`);

  const bad = await fetch(`${BASE}/api/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("refuses a deck without a device id", bad.status === 400, `HTTP ${bad.status}`);
} catch (e) {
  check("run", false, String(e));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} passed on ${BASE}`);
process.exit(failed ? 1 : 0);
