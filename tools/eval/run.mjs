/**
 * One staging eval run (docs/STAGING-LOG.md): photographs the fixed dish set
 * and deals any of the fixed profiles against a deployed API, then writes
 * what came back to an output folder. Every profile is made up: staging runs
 * on free tiers (SPEC §16).
 *
 *   node tools/eval/run.mjs --base https://… --out <dir> [--photos] [--profiles halal-8,noodles-5]
 *
 * Writes <dir>/photos.jsonl, <dir>/img/<id>.jpg, <dir>/decks.jsonl and
 * <dir>/summary.json. Decks go 65 s apart, under the free tier's 8K tokens a
 * minute. A failed photo stops the run, since it is usually the image
 * allowance running out.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? true : (all[i + 1] ?? true)]] : acc), []),
);
if (!args.base || !args.out) {
  console.error("usage: node tools/eval/run.mjs --base <url> --out <dir> [--photos] [--profiles id,id]");
  process.exit(2);
}
const BASE = String(args.base).replace(/\/$/, "");
const OUT = String(args.out).replace(/\/$/, "");
mkdirSync(`${OUT}/img`, { recursive: true });
const here = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(buf) {
  for (let k = 2; k + 9 < buf.length; ) {
    const marker = buf[k + 1];
    if (marker === 0xc0 || marker === 0xc2) return { w: buf.readUInt16BE(k + 7), h: buf.readUInt16BE(k + 5) };
    k += 2 + buf.readUInt16BE(k + 2);
  }
  return { w: 0, h: 0 };
}

async function photo(id, name, prompt) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Pantry-Device": "eval-photos-0000000001" },
    body: JSON.stringify({ name, prompt }),
  });
  const { url } = await res.json();
  const rec = { id, name, prompt, status: res.status, ok: Boolean(url), ms: Date.now() - started, bytes: 0, w: 0, h: 0 };
  if (url) {
    const buf = Buffer.from(url.split(",")[1], "base64");
    Object.assign(rec, { bytes: buf.length }, jpegSize(buf));
    writeFileSync(`${OUT}/img/${id}.jpg`, buf);
  }
  appendFileSync(`${OUT}/photos.jsonl`, `${JSON.stringify(rec)}\n`);
  console.log(`photo ${id}: ${rec.ok ? `${rec.bytes >> 10} KB, ${rec.ms} ms` : `failed (${rec.status})`}`);
  if (!rec.ok) throw new Error(`photo ${id} failed: check the Worker log (image allowance?)`);
  return rec;
}

async function deal({ id, profile, session }) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/deck`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Pantry-Device": `eval-${randomUUID()}` },
    body: JSON.stringify({ profile, session, local_date: new Date().toLocaleDateString("en-CA") }),
  });
  let final = {};
  for (const line of (await res.text()).trim().split("\n")) {
    try {
      const o = JSON.parse(line);
      if (!o.stage) final = o;
    } catch {}
  }
  const cards = final.deck ?? [];
  const over = cards.filter((c) => c.pricing.over_by > 0);
  const rec = {
    id,
    status: res.status,
    ms: Date.now() - started,
    error: final.error ?? null,
    cards: cards.length,
    dropped: final.dropped ?? null,
    over_budget: over.length,
    worst_over: over.length ? Math.max(...over.map((c) => c.pricing.over_by)) : 0,
    deck: cards,
  };
  appendFileSync(`${OUT}/decks.jsonl`, `${JSON.stringify(rec)}\n`);
  console.log(`deck ${id}: ${rec.cards} cards, ${rec.over_budget} over budget (worst ~$${rec.worst_over.toFixed(2)}), ${rec.ms} ms${rec.error ? `, error ${rec.error}` : ""}`);
  return rec;
}

const summary = { base: BASE, at: new Date().toISOString() };
if (args.photos) {
  const recs = [];
  for (const d of here("./photo-set.json")) recs.push(await photo(d.id, d.name, d.prompt));
  summary.photos = { count: recs.length, median_kb: Math.round(median(recs.map((r) => r.bytes)) / 1024), max_kb: Math.round(Math.max(...recs.map((r) => r.bytes)) / 1024), median_ms: median(recs.map((r) => r.ms)) };
}
if (args.profiles) {
  const wanted = String(args.profiles).split(",");
  const all = here("./profiles.json");
  const recs = [];
  for (const [i, id] of wanted.entries()) {
    const p = all.find((x) => x.id === id);
    if (!p) throw new Error(`no profile '${id}' in profiles.json`);
    if (i > 0) await sleep(65_000);
    recs.push(await deal(p));
  }
  summary.decks = recs.map(({ deck, ...r }) => r);
}
writeFileSync(`${OUT}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
