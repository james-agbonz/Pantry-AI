import type { Card, DealStage, PricedCard, Pricing, Profile, Session } from "@pantry/contract";
import type { ItemOption } from "@pantry/pricing";

export type { ItemOption };

/**
 * Where decks come from. Mock now; later a client for `POST /api/deck`,
 * which runs constraint builder → engine → validation → pricing → sort.
 */
export interface DeckSource {
  /**
   * Priced cards in deck order (SPEC §10). `onStage` is called as each stage
   * of the pipeline finishes, so Loading can show real progress.
   */
  deal(profile: Profile, session: Session, opts?: { size?: number; onStage?: (done: DealStage) => void }): Promise<Dealt>;
}

export interface Dealt {
  cards: PricedCard[];
  /** Decks left today, when the server says; the server's count is the one that holds. */
  left?: number;
}

/**
 * Why a deal was refused or failed. `server` and `no_cards` mean the server
 * gave the deck back; `network` means the phone lost the connection, and the
 * server may still have counted it.
 */
export type DealFailure = "daily_limit" | "rate_limit" | "busy" | "bad_request" | "bad_date" | "server" | "no_cards" | "network";

export class DealError extends Error {
  constructor(readonly reason: DealFailure) {
    super(`deal failed: ${reason}`);
  }
}

/**
 * Dish photos, fetched through the app's backend (SPEC §11). `order` is the
 * card's place in the deck: the top card is requested first. `null` means the
 * image failed and the card shows its plain fallback.
 */
export interface ImageSource {
  load(prompt: string, order: number): Promise<string | null>;
}

/**
 * Prices cards on the phone, for swaps on the meal screen (SPEC §9). Backed
 * by `@pantry/pricing` and the current price table, the same code the
 * server runs.
 */
export interface Pricer {
  /** Items the diet allows in a group, cheapest first. */
  options(group: string): ItemOption[];
  /** `choices` maps a group to the option (`item@store`) picked on the meal screen; otherwise the default pick. */
  price(card: Card, budget: number, choices?: Readonly<Record<string, string>>): Pricing;
  /** A store's display name, e.g. "Luciano's No Frills". */
  storeName(id: string): string;
  /** True for a national typical price rather than one store's: no store is named on the line. */
  isAverage(id: string): boolean;
}

/**
 * The current price table (SPEC §16), fetched from the backend so a monthly
 * refresh needs no app release. Returns the raw table; the app checks it
 * before use. Mock until `GET /api/prices` exists.
 */
export interface PriceTableSource {
  /**
   * The raw table, or `undefined` when the server says the one we have
   * (`knownVersion`) is still current.
   */
  fetch(knownVersion?: string): Promise<unknown>;
}
