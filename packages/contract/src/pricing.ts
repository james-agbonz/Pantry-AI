import { z } from "zod";
import { Card } from "./card";

const Money = z.number().nonnegative();

/**
 * Pricing output for one card (SPEC §9). Produced by the pricing module
 * (build step 6), never by the engine. Every figure is a typical price and
 * displays with `~`.
 */
const Line = {
  /** The group the item was resolved from; the meal screen swaps within it (SPEC §12). */
  group: z.string().min(1),
  item: z.string().min(1),
  /** Minimum sellable unit, e.g. "400g". The price is for the whole unit. */
  unit: z.string().min(1),
  price: Money,
};

export const Pricing = z.strictObject({
  buy: z.array(z.strictObject({ ...Line, role: z.enum(["needed", "completes"]) })),
  to_complete: z.array(z.strictObject(Line)),
  total: Money,
  budget: Money,
  over_by: Money,
  complete_cost: Money,
});
export type Pricing = z.infer<typeof Pricing>;

/** A card as the deck shows it: the engine's card with its price attached. */
export const PricedCard = z.strictObject({ card: Card, pricing: Pricing });
export type PricedCard = z.infer<typeof PricedCard>;

/**
 * Deck order tiers (SPEC §10): fits including the complete-the-meal items,
 * fits but needs the extra to be complete, over budget.
 */
export type BudgetStatus = "fits" | "complete" | "over";

export function budgetStatus(p: Pricing): BudgetStatus {
  if (p.over_by > 0) return "over";
  return p.to_complete.length > 0 ? "complete" : "fits";
}

/**
 * The stages of dealing a deck (SPEC §16), in order: constraint builder,
 * engine with validation, pricing, sort. `/api/deck` reports each one as it
 * finishes, so Loading ticks with the real work, never on a timer.
 */
export const DealStage = z.enum(["reading", "building", "pricing", "sorting"]);
export type DealStage = z.infer<typeof DealStage>;
