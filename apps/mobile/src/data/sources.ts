import type { Card, DealStage, PricedCard, Pricing, Profile, Session } from "@pantry/contract";

/**
 * Where decks come from. Mock now; later a client for `POST /api/deck`,
 * which runs constraint builder → engine → validation → pricing → sort.
 */
export interface DeckSource {
  /**
   * Priced cards in deck order (SPEC §10). `onStage` is called as each stage
   * of the pipeline finishes, so Loading can show real progress.
   */
  deal(profile: Profile, session: Session, opts?: { size?: number; onStage?: (done: DealStage) => void }): Promise<PricedCard[]>;
}

/**
 * Dish photos, fetched through the app's backend (SPEC §11). `order` is the
 * card's place in the deck: the top card is requested first. `null` means the
 * image failed and the card shows its plain fallback.
 */
export interface ImageSource {
  load(prompt: string, order: number): Promise<string | null>;
}

/** One item a group can resolve to, at its minimum sellable unit. */
export interface ItemOption {
  id: string;
  name: string;
  unit: string;
  price: number;
}

/**
 * Prices cards (SPEC §9). Pure and table-driven, so it can run on the phone
 * when an item is swapped. Mock now; the pricing module in build step 6.
 */
export interface Pricer {
  /** Items the diet allows in a group, cheapest first. */
  options(group: string): ItemOption[];
  /** `choices` maps a group to the item picked on the meal screen; otherwise the cheapest. */
  price(card: Card, budget: number, choices?: Readonly<Record<string, string>>): Pricing;
}
