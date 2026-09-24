import type { DealStage, PricedCard, Profile, Session } from "@pantry/contract";
import { buildConstraints, dealDeck, type DealOptions, type Deal } from "@pantry/engine";
import { priceCard, sortDeck } from "@pantry/pricing";
import type { Vocabulary } from "@pantry/vocabulary";

export interface PricedDeal extends Omit<Deal, "cards"> {
  /** Priced and in deck order (SPEC §10). */
  cards: PricedCard[];
}

/**
 * The whole `/api/deck` pipeline (SPEC §16): constraint builder → engine and
 * validation → pricing → sort. `onStage` hears each stage as it finishes, so
 * Loading ticks with the real work.
 */
export async function dealPricedDeck(
  profile: Profile,
  session: Session,
  opts: Omit<DealOptions, "vocabulary"> & { vocabulary: Vocabulary; onStage?: (done: DealStage) => void },
): Promise<PricedDeal> {
  const { onStage, vocabulary, ...engineOpts } = opts;
  const { input, diet } = buildConstraints(profile, session);
  onStage?.("reading");

  const deal = await dealDeck(input, diet, { ...engineOpts, vocabulary });
  onStage?.("building");

  const priced = deal.cards.map((card) => ({ card, pricing: priceCard(card, input.budget, vocabulary, { diet }) }));
  onStage?.("pricing");

  const cards = sortDeck(priced, input.targets);
  onStage?.("sorting");
  return { ...deal, cards };
}
