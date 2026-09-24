import { excludedBy, type CardError, type Condition, type EngineInput, type GroupRef } from "@pantry/contract";
import type { LlmRequest } from "./llm";

/** A group as the prompt shows it. `label` comes from the vocabulary. */
export interface PromptGroup extends GroupRef {
  label: string;
}

/** SPEC §7 condition rules, as dish rules for the model. */
const CONDITION_RULES: Record<Condition, string> = {
  diabetes: "The user has diabetes: steady carbohydrates, low sugar, favour whole grains, legumes and fibre.",
  blood_pressure: "The user manages blood pressure: low sodium. Go easy on salt, soy sauce, broth, cured meat and salty sauces.",
  anemia: "The user has anemia: iron-rich dishes (legumes, leafy greens, red meat or eggs where allowed), with some vitamin C.",
  kidney: "The user has kidney disease: lower protein, moderate salt.",
  other: "The user manages a health condition: keep salt, sugar and saturated fat moderate.",
};

const GOAL_RULES: Record<EngineInput["goal"], string> = {
  eat_well: "Goal: eat well on little — balanced, filling dishes.",
  cut: "Goal: cut — high protein, moderate calories, filling.",
  bulk: "Goal: bulk — high protein, generous calories.",
  condition: "Goal: manage a health condition (rule below).",
};

const CARD_SHAPE = `{
  "id": "",
  "name": "Dish name",
  "time_min": 25,
  "kcal": 560,
  "protein_g": 38,
  "uses": ["rice", "corn"],
  "missing": [
    { "group": "white_fish", "qty": "300g", "role": "needed" },
    { "group": "frozen_veg", "qty": "1 cup", "role": "completes" }
  ],
  "methods": ["stove"],
  "steps": ["Step one.", "Step two."],
  "image_prompt": "Short description of the finished dish"
}`;

const SYSTEM = `You are the recipe engine for a meal app for people getting by on very little money, in Canada.
You suggest realistic home-cooked dishes built around what the user already has.
Reply with JSON only: no prose, no markdown fences.`;

/** The prompt for a whole deck. */
export function deckPrompt(input: EngineInput, groups: readonly PromptGroup[]): LlmRequest {
  return {
    system: SYSTEM,
    user: [
      `Suggest ${input.deck} different dishes. Reply with a JSON array of exactly ${input.deck} cards, each shaped like this:`,
      CARD_SHAPE,
      ...context(input, groups),
      `The ${input.deck} dishes must differ from each other in main protein, cooking method or cuisine.`,
    ].join("\n\n"),
  };
}

/**
 * The prompt to regenerate one card alone. `errors` are what the validator
 * found on the last attempt; `keep` are the names of cards already in the
 * deck, which the replacement must differ from.
 */
export function cardPrompt(
  input: EngineInput,
  groups: readonly PromptGroup[],
  errors: readonly CardError[],
  keep: readonly string[],
): LlmRequest {
  const problems = errors.map((e) => `- ${e.path ? `${e.path}: ` : ""}${e.message}`).join("\n");
  return {
    system: SYSTEM,
    user: [
      `Suggest one dish. Reply with a single JSON card object (not an array), shaped like this:`,
      CARD_SHAPE,
      ...context(input, groups),
      `A previous attempt was rejected for:\n${problems}`,
      keep.length ? `It must differ in main protein, cooking method or cuisine from: ${keep.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** Everything both prompts share: the §7 rules, the user's situation and the group list. */
function context(input: EngineInput, groups: readonly PromptGroup[]): string[] {
  const allowed = groups.filter((g) => excludedBy(g, input.exclude, groups).length === 0);
  const allowedIds = new Set(allowed.map((g) => g.group));
  const have = input.have.map((h) => h.group).filter((g) => allowedIds.has(g));

  const perDish = input.targets
    ? `Each dish aims at roughly a third of the daily targets: about ${Math.round(input.targets.kcal / 3)} kcal and ${Math.round(input.targets.protein / 3)} g protein per serving.`
    : "";

  return [
    [
      "The user has:",
      have.length ? `- groups: ${have.join(", ")}` : "- groups: none",
      input.have_other.length ? `- other: ${input.have_other.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    [
      "Rules:",
      input.exclude.length
        ? `- Never use, mention or show any of these, in any form, anywhere on the card: ${input.exclude.join(", ")}.`
        : "",
      input.methods.length
        ? `- Only these appliances: ${input.methods.join(", ")}. List the ones the dish needs in "methods". A knife, pan, bowl and plate are always available.`
        : `- The user has no appliances: no-cook dishes only, with "methods": [].`,
      `- "uses" lists what the dish uses from the user's groups or other items, spelled exactly as above.`,
      `- "missing" lists what must be bought, only from the group list below, by group id. Tag each "needed" if the dish can't be made without it, or "completes" if the dish works without it but it makes a nutritionally complete meal.`,
      `- "completes" is only for protein, vegetables or fibre that round out the meal. Never seasoning, spices, sauces, oil, garlic, lemon, broth or anything added for flavour: if the dish needs it, it's "needed"; otherwise leave it out.`,
      `- Quantities for ${input.servings} serving${input.servings === 1 ? "" : "s"}. "kcal" and "protein_g" are per serving.`,
      `- Budget is ${input.budget} CAD for everything bought: favour cheap staples. Never state a cost; leave all money out of the card.`,
      `- ${GOAL_RULES[input.goal]}`,
      perDish ? `- ${perDish}` : "",
      input.condition ? `- ${CONDITION_RULES[input.condition]}` : "",
      input.avoid.length ? `- Don't suggest these dishes again: ${input.avoid.join("; ")}.` : "",
      `- "image_prompt": home cooking on a normal plate, realistic portion, kitchen light. A cheap dinner must not look like an expensive one.`,
      `- Leave "id" as "".`,
    ]
      .filter(Boolean)
      .join("\n"),
    `Group list (id: label):\n${allowed.map((g) => `${g.group}: ${g.label}`).join("\n")}`,
  ];
}
