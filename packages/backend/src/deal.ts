/**
 * Dev check: deals one deck with whatever provider the environment picks and
 * prints it. `npm run deal -w @pantry/backend` loads the repo's `.env` if there
 * is one; with none, LLM_PROVIDER defaults to `mock` and nothing leaves the machine.
 */
import { buildConstraints, dealDeck } from "@pantry/engine";
import { vocabulary } from "@pantry/vocabulary";
import { loadConfig } from "./config";
import { createLlm } from "./llm";

const config = loadConfig();
const { input, diet } = buildConstraints(
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
);

const deal = await dealDeck(input, diet, { llm: createLlm(config.llm), vocabulary });
for (const c of deal.cards) {
  const buy = c.missing.map((m) => `${m.group} ${m.qty} (${m.role})`).join(", ");
  console.log(`- ${c.name} · ~${c.kcal} kcal · ~${c.protein_g} g protein · ${c.time_min} min\n  buy: ${buy}`);
}
for (const d of deal.dropped) console.log(`- slot ${d.index} dropped: ${d.errors.map((e) => e.message).join("; ")}`);
