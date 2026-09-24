import { Card, type Profile, type Session } from "@pantry/contract";
import { priceCard, sortDeck } from "@pantry/pricing";
import type { Vocabulary } from "@pantry/vocabulary";
import type { DeckSource, ImageSource } from "@/data/sources";
import cardsJson from "./cards.json";

/**
 * Mock decks for building screens, until the app calls `/api/deck`. The cards
 * are hand-written; pricing and sort are the real modules, over the current
 * price table (placeholder prices until step 7).
 */

export const MOCK_CARDS: readonly Card[] = cardsJson.map((c) => Card.parse(c));

let nextId = 1;

/**
 * Runs the same four stages as `/api/deck`, reporting each as it finishes.
 * The wait sits inside "building", standing in for the model call; the UI
 * only ever moves on these events.
 */
export const mockDeckSource = (getVocabulary: () => Vocabulary, buildMs = 900): DeckSource => ({
  async deal(profile: Profile, session: Session, { size = 6, onStage } = {}) {
    const diet = { halal: profile.limits.includes("halal") };
    onStage?.("reading");

    await new Promise((r) => setTimeout(r, buildMs));
    const avoid = new Set(session.avoid.map((n) => n.toLowerCase()));
    const pick = MOCK_CARDS.filter((c) => !avoid.has(c.name.toLowerCase())).slice(0, size);
    onStage?.("building");

    const vocabulary = getVocabulary();
    const priced = pick.map((c) => ({ card: { ...c, id: `mock-${nextId++}` }, pricing: priceCard(c, session.budget, vocabulary, { diet }) }));
    onStage?.("pricing");

    const sorted = sortDeck(priced, profile.targets);
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
