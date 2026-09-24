import type { PricedCard, Profile, Session } from "@pantry/contract";

/**
 * Where decks come from. Mock now; later a client for `POST /api/deck`,
 * which runs constraint builder → engine → validation → pricing → sort.
 */
export interface DeckSource {
  /** Priced cards in deck order (SPEC §10). */
  deal(profile: Profile, session: Session, size?: number): Promise<PricedCard[]>;
}

/**
 * Dish photos, fetched through the app's backend (SPEC §11). `order` is the
 * card's place in the deck: the top card is requested first. `null` means the
 * image failed and the card shows its plain fallback.
 */
export interface ImageSource {
  load(prompt: string, order: number): Promise<string | null>;
}
