import { itemOptions, priceCard } from "@pantry/pricing";
import type { Diet, Vocabulary } from "@pantry/vocabulary";
import type { Pricer } from "./sources";

/** The pricing module over the current price table and the user's diet. */
export function tablePricer(vocabulary: Vocabulary, diet: Diet): Pricer {
  return {
    options: (group) => itemOptions(vocabulary, group, diet),
    price: (card, budget, choices) => priceCard(card, budget, vocabulary, { diet, choices }),
  };
}
