import { budgetStatus, Card, excludeTerms, type PricedCard, type Pricing, type Profile, type Session } from "@pantry/contract";
import { NO_DIET, type Diet } from "@pantry/vocabulary";
import type { DeckSource, ImageSource } from "@/data/sources";
import cardsJson from "./cards.json";
import { mockPricer } from "./pricer";

/**
 * Mock data for building screens (step 5). Replaced by `/api/deck` (engine →
 * validation → pricing → sort) once pricing exists. The pricing and sort
 * here are stand-ins so badges and order react to the budget; step 6 builds
 * the real, tested module and this file goes.
 */

export const MOCK_CARDS: readonly Card[] = cardsJson.map((c) => Card.parse(c));

const TIER = { fits: 0, complete: 1, over: 2 } as const;

/** Stand-in pricing on placeholder prices, cheapest item per group. Kept for tests and the deck. */
export function mockPrice(card: Card, budget: number, diet: Diet = NO_DIET): Pricing {
  return mockPricer(diet).price(card, budget);
}

/** Stand-in for SPEC §10 order: tier, then closest to the per-meal protein target. */
export function mockSort(deck: PricedCard[], proteinTarget: number | null): PricedCard[] {
  const perMeal = proteinTarget === null ? null : proteinTarget / 3;
  return [...deck].sort((a, b) => {
    const t = TIER[budgetStatus(a.pricing)] - TIER[budgetStatus(b.pricing)];
    if (t !== 0) return t;
    if (budgetStatus(a.pricing) === "over") return a.pricing.over_by - b.pricing.over_by;
    return perMeal === null ? 0 : Math.abs(a.card.protein_g - perMeal) - Math.abs(b.card.protein_g - perMeal);
  });
}

let nextId = 1;

/**
 * Runs the same four stages as `/api/deck`, reporting each as it finishes.
 * The wait sits inside "building", standing in for the model call; the UI
 * only ever moves on these events.
 */
export const mockDeckSource = (buildMs = 900): DeckSource => ({
  async deal(profile: Profile, session: Session, { size = 6, onStage } = {}) {
    const input = { ...session, exclude: excludeTerms(profile) };
    onStage?.("reading");

    await new Promise((r) => setTimeout(r, buildMs));
    const avoid = new Set(input.avoid.map((n) => n.toLowerCase()));
    const pick = MOCK_CARDS.filter((c) => !avoid.has(c.name.toLowerCase())).slice(0, size);
    onStage?.("building");

    const pricer = mockPricer({ halal: profile.limits.includes("halal") });
    const priced = pick.map((c) => ({ card: { ...c, id: `mock-${nextId++}` }, pricing: pricer.price(c, input.budget) }));
    onStage?.("pricing");

    const sorted = mockSort(priced, profile.targets?.protein ?? null);
    onStage?.("sorting");
    return sorted;
  },
});

/**
 * No food photos exist yet, so every image fails after a short, staggered
 * wait and the card shows its plain fallback (SPEC §11). The fade-in path is
 * wired and gets exercised once the Flux adapter returns real photos.
 */
export const mockImageSource = (): ImageSource => ({
  async load(_prompt: string, order: number) {
    await new Promise((r) => setTimeout(r, 300 + order * 150));
    return null;
  },
});
