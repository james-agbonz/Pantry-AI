import type { PricedCard } from "@pantry/contract";

/** Free decks per day (SPEC §14). */
export const DAILY_DECKS = 3;

/**
 * One deck being swiped (SPEC §10). Swipe left passes; rewind brings back the
 * last pass, as often as wanted; swipe right selects and ends the deck, which
 * the screen handles by opening the meal.
 */
export interface DeckState {
  cards: PricedCard[];
  /** Position of the top card. `cards.length` once every card is passed. */
  index: number;
}

export type DeckAction = { type: "pass" } | { type: "rewind" };

export function deckReducer(s: DeckState, a: DeckAction): DeckState {
  switch (a.type) {
    case "pass":
      return s.index < s.cards.length ? { ...s, index: s.index + 1 } : s;
    case "rewind":
      return s.index > 0 ? { ...s, index: s.index - 1 } : s;
  }
}

export const topCard = (s: DeckState): PricedCard | undefined => s.cards[s.index];
export const allPassed = (s: DeckState) => s.cards.length > 0 && s.index >= s.cards.length;
export const canRewind = (s: DeckState) => s.index > 0;
/** Names of the cards passed so far: a new deck avoids them. */
export const passedNames = (s: DeckState) => s.cards.slice(0, s.index).map((c) => c.card.name);

export function decksLeftText(left: number): string {
  if (left <= 0) return "No decks left today";
  return `${left} ${left === 1 ? "deck" : "decks"} left today`;
}

/** "3 of 6 · 2 decks left today". */
export function counterText(s: DeckState, decksLeft: number): string {
  const total = s.cards.length;
  return `${Math.min(s.index + 1, total)} of ${total} · ${decksLeftText(decksLeft)}`;
}

/** Local calendar day, so the limit resets at the user's midnight. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DeckCount {
  day: string;
  used: number;
}

export function decksLeft(count: DeckCount | null, today: string): number {
  const used = count && count.day === today ? count.used : 0;
  return Math.max(0, DAILY_DECKS - used);
}

export function countDeck(count: DeckCount | null, today: string): DeckCount {
  return { day: today, used: (count && count.day === today ? count.used : 0) + 1 };
}
