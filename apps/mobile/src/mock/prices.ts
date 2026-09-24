import { bundledPriceTable } from "@pantry/vocabulary";
import type { PriceTableSource } from "@/data/sources";

/**
 * Stands in for `GET /api/prices` until the HTTP route exists: serves the
 * bundled table after a short wait, as the server would.
 */
export const mockPriceTableSource = (delayMs = 300): PriceTableSource => ({
  async fetch() {
    await new Promise((r) => setTimeout(r, delayMs));
    return bundledPriceTable;
  },
});
