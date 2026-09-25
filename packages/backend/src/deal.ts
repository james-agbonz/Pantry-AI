/**
 * Dev check: deals one deck with whatever provider the environment picks and
 * prints it. `npm run deal -w @pantry/backend` loads the repo's `.env` if there
 * is one; with none, LLM_PROVIDER defaults to `mock` and nothing leaves the machine.
 */
import { vocabulary } from "@pantry/vocabulary";
import { loadConfig } from "./config";
import { dealPricedDeck } from "./deck";
import { createLlm } from "./llm";
import { currentPriceTable } from "./prices";

const config = loadConfig();
const priced = vocabulary.withTable(currentPriceTable());
const deal = await dealPricedDeck(
  {
    goal: "eat_well",
    condition: null,
    limits: ["no_pork", "nuts"],
    limits_other: [],
    appliances: ["stove", "microwave", "fridge"],
    servings: 1,
    targets: { kcal: 2400, protein: 140 },
  },
  { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] },
  { llm: createLlm(config.llm), vocabulary: priced, on: new Date().toISOString().slice(0, 10), onStage: (s) => console.log(`  ✓ ${s}`) },
);
const money = (n: number) => `~$${n.toFixed(2)}`;
for (const { card: c, pricing: p } of deal.cards) {
  const status = p.over_by > 0 ? `over by ${money(p.over_by)}` : p.to_complete.length ? `+${money(p.complete_cost)} to complete` : "fits";
  console.log(`- ${c.name} · ${money(p.total)} of $${p.budget} (${status}) · ~${c.kcal} kcal · ~${c.protein_g} g protein`);
  for (const b of p.buy) console.log(`    buy ${b.item}, ${b.unit} ${money(b.price)}${b.role === "completes" ? " (completes)" : ""}`);
  for (const t of p.to_complete) console.log(`    to complete: ${t.item}, ${t.unit} ${money(t.price)}`);
}
for (const d of deal.dropped) console.log(`- slot ${d.index} dropped: ${d.errors.map((e) => e.message).join("; ")}`);
console.log(priced.placeholder ? `Prices are samples for testing, not real (table ${priced.version}).` : `Prices are typical, not quotes (table ${priced.version}).`);
