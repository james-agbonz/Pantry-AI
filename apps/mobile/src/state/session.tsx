import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PricedCard, Session } from "@pantry/contract";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { DeckSource, ImageSource, Pricer } from "@/data/sources";
import { countDeck, dayKey, deckReducer, decksLeft, passedNames, type DeckAction, type DeckCount, type DeckState } from "@/deck/state";
import { parseBudget } from "@/format";
import { mockDeckSource, mockImageSource } from "@/mock/deck";
import { mockPricer } from "@/mock/pricer";
import { useProfile } from "./profile";

const COUNT_KEY = "pantry.decks.v1";

/**
 * What Home collects and the deck in play. The budget and passes belong to
 * this session only; a new session starts fresh (SPEC §10). The daily deck
 * count is kept on the device.
 */
interface SessionData {
  have: string[];
  have_other: string[];
  budgetText: string;
  /** Dish names passed this session: new decks avoid them. */
  avoid: string[];
  deck: DeckState | null;
  /** The meal picked by swiping right. Opens the meal screen (5c). */
  selected: PricedCard | null;
  /** The photo the deck loaded for it, reused so the meal screen doesn't ask again. `null` if it failed. */
  selectedPhoto: string | null;
}

type Action =
  | { type: "toggle_have"; group: string }
  | { type: "add_other"; text: string }
  | { type: "remove_other"; text: string }
  | { type: "budget"; text: string }
  | { type: "dealt"; cards: PricedCard[] }
  | { type: "deck"; action: DeckAction }
  | { type: "select"; card: PricedCard; photo: string | null };

const START: SessionData = { have: [], have_other: [], budgetText: "", avoid: [], deck: null, selected: null, selectedPhoto: null };

function reduce(s: SessionData, a: Action): SessionData {
  switch (a.type) {
    case "toggle_have":
      return { ...s, have: s.have.includes(a.group) ? s.have.filter((g) => g !== a.group) : [...s.have, a.group] };
    case "add_other": {
      const t = a.text.trim();
      if (!t || s.have_other.some((x) => x.toLowerCase() === t.toLowerCase())) return s;
      return { ...s, have_other: [...s.have_other, t] };
    }
    case "remove_other":
      return { ...s, have_other: s.have_other.filter((x) => x !== a.text) };
    case "budget":
      return { ...s, budgetText: a.text };
    case "dealt":
      // Passes on the old deck carry into `avoid` so the new one differs.
      return { ...s, avoid: [...new Set([...s.avoid, ...(s.deck ? passedNames(s.deck) : [])])], deck: { cards: a.cards, index: 0 }, selected: null };
    case "deck":
      return s.deck ? { ...s, deck: deckReducer(s.deck, a.action) } : s;
    case "select":
      return { ...s, selected: a.card, selectedPhoto: a.photo };
  }
}

interface SessionState extends SessionData {
  dispatch: (a: Action) => void;
  budget: number | null;
  /** Free decks left today, or `undefined` while loading. */
  decksLeft: number | undefined;
  /** Contract session for the deck source; `avoid` includes this deck's passes. */
  toSession: () => Session | null;
  /** Records a dealt deck against today's limit. */
  countDealt: () => Promise<void>;
  decks: DeckSource;
  images: ImageSource;
  /** Re-prices the picked meal when an item is swapped. Halal narrows meat to certified items. */
  pricer: Pricer;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reduce, START);
  const [count, setCount] = useState<DeckCount | null | undefined>(undefined);
  const [sources] = useState(() => ({ decks: mockDeckSource(), images: mockImageSource() }));
  const { profile } = useProfile();
  const halal = profile?.limits.includes("halal") ?? false;
  const pricer = useMemo(() => mockPricer({ halal }), [halal]);

  useEffect(() => {
    AsyncStorage.getItem(COUNT_KEY)
      .then((raw) => setCount(raw ? (JSON.parse(raw) as DeckCount) : null))
      .catch(() => setCount(null));
  }, []);

  const countDealt = useCallback(async () => {
    const next = countDeck(count ?? null, dayKey(new Date()));
    setCount(next);
    await AsyncStorage.setItem(COUNT_KEY, JSON.stringify(next));
  }, [count]);

  const budget = parseBudget(data.budgetText);
  const toSession = useCallback((): Session | null => {
    if (budget === null) return null;
    const avoid = [...new Set([...data.avoid, ...(data.deck ? passedNames(data.deck) : [])])];
    return { have: data.have, have_other: data.have_other, budget, avoid };
  }, [budget, data]);

  const value = useMemo<SessionState>(
    () => ({
      ...data,
      dispatch,
      budget,
      decksLeft: count === undefined ? undefined : decksLeft(count, dayKey(new Date())),
      toSession,
      countDealt,
      ...sources,
      pricer,
    }),
    [data, budget, count, toSession, countDealt, sources, pricer],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
