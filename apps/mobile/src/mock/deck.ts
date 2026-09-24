import { budgetStatus, Card, excludeTerms, type PricedCard, type Pricing, type Profile, type Session } from "@pantry/contract";
import { vocabulary } from "@pantry/vocabulary";
import type { DeckSource, ImageSource } from "@/data/sources";
import cardsJson from "./cards.json";
import { PLACEHOLDER_PRICES } from "./prices";

/**
 * Mock data for building screens (step 5). Replaced by `/api/deck` (engine →
 * validation → pricing → sort) once pricing exists. The pricing and sort
 * here are stand-ins so badges and order react to the budget; step 6 builds
 * the real, tested module and this file goes.
 */

export const MOCK_CARDS: readonly Card[] = cardsJson.map((c) => Card.parse(c));

const TIER = { fits: 0, complete: 1, over: 2 } as const;

/** Stand-in for SPEC §9: needed first, then completes in order while they fit. */
export function mockPrice(card: Card, budget: number): Pricing {
  const line = (group: string) => ({
    item: vocabulary.itemsFor(group)[0]?.name ?? group,
    price: PLACEHOLDER_PRICES[group] ?? 3.0,
  });
  const round = (n: number) => Math.round(n * 100) / 100;

  const buy: Pricing["buy"] = card.missing.filter((m) => m.role === "needed").map((m) => ({ ...line(m.group), role: "needed" }));
  let total = buy.reduce((s, b) => s + b.price, 0);
  const to_complete: Pricing["to_complete"] = [];
  for (const m of card.missing.filter((x) => x.role === "completes")) {
    const l = line(m.group);
    if (total + l.price <= budget) {
      buy.push({ ...l, role: "completes" });
      total += l.price;
    } else to_complete.push(l);
  }
  return {
    buy,
    to_complete,
    total: round(total),
    budget,
    over_by: round(Math.max(0, total - budget)),
    complete_cost: round(to_complete.reduce((s, t) => s + t.price, 0)),
  };
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

    const priced = pick.map((c) => ({ card: { ...c, id: `mock-${nextId++}` }, pricing: mockPrice(c, input.budget) }));
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
