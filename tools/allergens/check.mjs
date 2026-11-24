/**
 * Checks the hand-set allergen tags in packages/vocabulary/data/groups.json
 * against Open Food Facts (open data, ODbL): for each group, the allergens
 * declared on up to 24 products sold in Canada that match the group's label.
 *
 *   node tools/allergens/check.mjs [--out report.json] [--only pasta,bread]
 *
 * Prints, per group, how often each allergen appears on those products and
 * flags two kinds of gap: a tag we set that few products declare, and an
 * allergen most products declare that we don't tag. Reports only; a person
 * decides what to change. Keeps to Open Food Facts' search rate limit
 * (10 a minute) and identifies itself, as their API terms ask.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const only = opt("--only")?.split(",");
const out = opt("--out");

const groups = JSON.parse(readFileSync(new URL("../../packages/vocabulary/data/groups.json", import.meta.url), "utf8")).groups;

/** Open Food Facts allergen tags → our tags. Gluten implies wheat for wheat-based groups; oats, barley and rye keep gluten only. */
const MAP = {
  "en:gluten": ["gluten"],
  "en:milk": ["milk"],
  "en:eggs": ["eggs"],
  "en:soybeans": ["soy"],
  "en:nuts": ["tree_nuts"],
  "en:peanuts": ["peanuts"],
  "en:sesame-seeds": ["sesame"],
  "en:fish": ["fish"],
  "en:crustaceans": ["shellfish"],
  "en:molluscs": ["shellfish"],
  "en:mustard": ["mustard"],
  "en:sulphur-dioxide-and-sulphites": ["sulphites"],
};

/** Words that make a search hit the wrong kind of product. */
const QUERY = {
  rice: "white rice", brown_rice: "brown rice", flour: "all purpose flour", bread: "sliced bread", buns: "hamburger buns", crackers: "soda crackers",
  milk: "2% milk", cheese: "cheddar cheese", eggs: "large eggs", corn: "corn kernels", canned_tomatoes: "diced tomatoes", frozen_veg: "frozen mixed vegetables",
  canned_fruit: "fruit cocktail", frozen_berries: "frozen berries", white_fish: "fish fillets", canned_tuna: "tuna", canned_salmon: "pink salmon", shrimp: "shrimp",
  cooking_oil: "canola oil", seasoning: "seasoning blend", pasta_sauce: "pasta sauce", salsa: "salsa", bbq_sauce: "barbecue sauce", vegetable_broth: "vegetable broth",
  chicken_broth: "chicken broth", beef_broth: "beef broth", deli_turkey: "sliced turkey breast", ham: "sliced ham", pork_sausage: "pork sausages", fish_sticks: "fish sticks",
  garlic: "garlic", lemon: "lemon juice", raisins: "raisins", coconut_milk: "coconut milk", margarine: "margarine", sunflower_seeds: "sunflower seeds",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
const todo = groups.filter((g) => !only || only.includes(g.id));
for (const [n, g] of todo.entries()) {
  const q = QUERY[g.id] ?? g.label;
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&tagtype_0=countries&tag_contains_0=contains&tag_0=canada&fields=product_name,allergens_tags,traces_tags`;
  let products = [];
  // Open Food Facts often answers 503 when busy: wait longer each time, up to 4 tries.
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "PantryAllergenCheck/0.1 (meal app; contact via GitHub james-agbonz/Pantry-AI)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      products = (await res.json()).products ?? [];
      break;
    } catch (e) {
      console.log(`${g.id}: ${e.message}${attempt < 4 ? `, retrying in ${15 * attempt} s` : ", giving up"}`);
      if (attempt < 4) await sleep(15000 * attempt);
    }
  }
  // Count each of our tags over the products that declare any allergen info at all.
  const declared = products.filter((p) => (p.allergens_tags?.length ?? 0) + (p.traces_tags?.length ?? 0) > 0);
  const count = {};
  for (const p of declared) {
    const ours = new Set();
    for (const t of [...(p.allergens_tags ?? []), ...(p.traces_tags ?? [])]) for (const o of MAP[t] ?? []) ours.add(o);
    if (ours.has("gluten") && !["oats", "barley"].includes(g.id)) ours.add("wheat");
    for (const o of ours) count[o] = (count[o] ?? 0) + 1;
  }
  const share = Object.fromEntries(Object.entries(count).map(([k, v]) => [k, Math.round((100 * v) / declared.length)]));
  const weSet = g.contains;
  const rarelyDeclared = weSet.filter((t) => (share[t] ?? 0) < 20);
  const oftenDeclaredNotSet = Object.entries(share).filter(([t, s]) => s >= 50 && !weSet.includes(t)).map(([t]) => t);
  report.push({ group: g.id, label: g.label, query: q, products: products.length, declared: declared.length, share, ours: weSet, rarelyDeclared, oftenDeclaredNotSet });
  const flag = [rarelyDeclared.length ? `we set but <20% declare: ${rarelyDeclared.join(", ")}` : "", oftenDeclaredNotSet.length ? `>=50% declare, we don't set: ${oftenDeclaredNotSet.join(", ")}` : ""].filter(Boolean).join("; ");
  console.log(`${n + 1}/${todo.length} ${g.id} (${declared.length}/${products.length} declare): ${Object.entries(share).map(([k, v]) => `${k} ${v}%`).join(", ") || "nothing"}${flag ? `  <<< ${flag}` : ""}`);
  if (n < todo.length - 1) await sleep(6500);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
