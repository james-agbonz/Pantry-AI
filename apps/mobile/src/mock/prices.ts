import { bundledPriceTable } from "@pantry/vocabulary";
import type { PriceTableSource } from "@/data/sources";

/**
 * Stands in for `GET /api/prices` until the HTTP route exists: serves the
 * bundled table after a short wait, as the server would.
 */
export const mockPriceTableSource = (delayMs = 300): PriceTableSource => ({
  async fetch(knownVersion) {
    // Like the server: nothing to send when the phone already has this version.
    if (knownVersion === (bundledPriceTable as { version: string }).version) return undefined;
    await new Promise((r) => setTimeout(r, delayMs));
    return bundledPriceTable;
  },
});
