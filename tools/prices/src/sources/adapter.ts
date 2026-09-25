import type { Price, PriceTable } from "@pantry/vocabulary";

export interface SourceContext {
  /** The table in use now: its items, and its placeholders for anything not re-priced. */
  current: PriceTable;
  /** Today, YYYY-MM-DD. */
  on: string;
}

/**
 * One place prices come from: StatCan, the hand-entry CSV, later one per
 * store (official APIs, feeds or licensed data only). Chosen by
 * `PRICE_SOURCES`, the same pattern as `LLM_PROVIDER`. Each returns real
 * price records; the build merges them and refuses two for the same item at
 * the same store.
 */
export interface PriceSourceAdapter {
  id: string;
  load(ctx: SourceContext): Promise<Price[]>;
}
