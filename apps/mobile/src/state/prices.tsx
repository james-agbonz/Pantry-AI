import AsyncStorage from "@react-native-async-storage/async-storage";
import { vocabulary as bundled, type Vocabulary } from "@pantry/vocabulary";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { pickTable } from "@/data/priceTable";
import type { PriceTableSource } from "@/data/sources";
import { API_URL, apiFetch } from "@/data/api";
import { httpPriceTableSource } from "@/data/http";
import { mockPriceTableSource } from "@/mock/prices";

const KEY = "pantry.prices.v1";

/** Made once: a new source per render would re-run the fetch on every render, forever. */
const DEFAULT_SOURCE = API_URL ? httpPriceTableSource(API_URL, apiFetch) : mockPriceTableSource();

const Ctx = createContext<Vocabulary>(bundled);

/**
 * The price table in use. Starts from the bundled copy, switches to the cached
 * one if it's newer, then to a freshly fetched one once it checks out, and
 * caches that for next launch. Groups come with the app and never change.
 */
export function PriceTableProvider({ children, source = DEFAULT_SOURCE }: { children: ReactNode; source?: PriceTableSource }) {
  const [vocabulary, setVocabulary] = useState<Vocabulary>(bundled);

  useEffect(() => {
    let live = true;
    (async () => {
      let cached: unknown;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        cached = raw ? JSON.parse(raw) : undefined;
      } catch {
        cached = undefined;
      }
      const start = pickTable(bundled, { cached }).vocabulary;
      if (live) setVocabulary(start);

      let fetched: unknown;
      try {
        fetched = await source.fetch(start.version);
      } catch {
        return; // Offline or server down: keep what we have.
      }
      if (fetched === undefined) return; // The server says ours is current.
      const picked = pickTable(bundled, { fetched, cached });
      if (!live) return;
      setVocabulary(picked.vocabulary);
      if (picked.from === "fetched") await AsyncStorage.setItem(KEY, JSON.stringify(fetched)).catch(() => {});
    })();
    return () => {
      live = false;
    };
  }, [source]);

  return <Ctx.Provider value={vocabulary}>{children}</Ctx.Provider>;
}

/** The vocabulary with the current price table. */
export function usePriceTable(): Vocabulary {
  return useContext(Ctx);
}
