import { budgetStatus, type PricedCard, type Targets } from "@pantry/contract";

const TIER = { fits: 0, complete: 1, over: 2 } as const;

/**
 * Deck order (SPEC §10):
 * 1. fits including the complete-the-meal items,
 * 2. fits, but needs the extra to be complete,
 * 3. over budget, least over first.
 * Within a tier, closest to one meal's share of daily protein (a third, the
 * engine's per-dish aim) comes first. With no targets, the engine's order is
 * kept. The sort is stable.
 */
export function sortDeck(deck: readonly PricedCard[], targets: Targets | null): PricedCard[] {
  const perMeal = targets ? targets.protein / 3 : null;
  const gap = (c: PricedCard) => (perMeal === null ? 0 : Math.abs(c.card.protein_g - perMeal));
  return [...deck].sort((a, b) => {
    const tier = TIER[budgetStatus(a.pricing)] - TIER[budgetStatus(b.pricing)];
    if (tier !== 0) return tier;
    if (budgetStatus(a.pricing) === "over") {
      const over = Math.round(a.pricing.over_by * 100) - Math.round(b.pricing.over_by * 100);
      if (over !== 0) return over;
    }
    return gap(a) - gap(b);
  });
}
