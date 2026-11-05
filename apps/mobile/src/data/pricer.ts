import { itemOptions, priceCard } from "@pantry/pricing";
import type { Province } from "@pantry/contract";
import type { Diet, Vocabulary } from "@pantry/vocabulary";
import { dayKey } from "@/deck/state";
import type { Pricer } from "./sources";

/**
 * The pricing module over the current price table and the user's diet. `today`
 * is read at each call, so a sale ends at the user's midnight even with the
 * app left open.
 */
export function tablePricer(vocabulary: Vocabulary, diet: Diet, today: () => string = () => dayKey(new Date()), province?: Province): Pricer {
  return {
    options: (group) => itemOptions(vocabulary, group, today(), diet, province),
    price: (card, budget, choices) => priceCard(card, budget, vocabulary, { diet, choices, on: today(), ...(province ? { province } : {}) }),
    storeName: (id) => vocabulary.stores.find((s) => s.id === id)?.name ?? id,
    isAverage: (id) => vocabulary.stores.find((s) => s.id === id)?.kind === "average",
  };
}
