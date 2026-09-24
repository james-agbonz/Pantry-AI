import { bundledPriceTable, PriceTable } from "@pantry/vocabulary";

/**
 * The current price table, versioned (SPEC §16). The app fetches this and
 * caches it, so a monthly refresh reaches phones without an app release.
 * Until the refresh job and `GET /api/prices` exist, it's the bundled table.
 */
export function currentPriceTable(): PriceTable {
  return PriceTable.parse(bundledPriceTable);
}
