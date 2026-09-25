# Backlog

Everything parked so far. `docs/SPEC.md` is what the app does; this is what's still to do around it. Move an item into the build order in `CLAUDE.md` when it's picked up, and delete it here when it's done.

## Before launch

- **Fill `tools/prices/manual-prices.csv` rows 1–83.** They clear every "Sample prices" label, halal users included (rows 84 onward only change swap options). Then run `npm run prices:import`.
  - Reference store: Luciano's No Frills, Toronto.
  - Row 1 is done: No Name canola oil 946 ml, $4.29, 2026-09-25. It reaches the table at the next `npm run prices:import`.
  - Browser lookups are paused until nofrills.ca is allowed in the Claude extension's site permissions.
- **Check allergen tags against real product labels.** The `contains` tags in `packages/vocabulary/data/groups.json` were set by hand.
- **Kitchen illustration** for the onboarding appliances screen, replacing the tiles. The one exception to "photos only" (DESIGN.md › Imagery).
- **Real food photos:** a real `ImageClient` adapter (Flux), behind `IMAGE_PROVIDER`.
- **API key** on a Console account with a spending limit, as `PANTRY_LLM_API_KEY` on the host. Then re-record the engine's sample responses (`packages/engine/test/fixtures`) from the real model; the current ones were written by hand.
- **App name and logo.** Packages use `pantry` until then.
- **Deploy the Worker** (`npm run deploy -w @pantry/backend`, after `wrangler login`), then measure a real deal's CPU time. Workers Free allows 10 ms per request; move to Workers Paid (~$5 a month) if it goes over. Point the app at it with `EXPO_PUBLIC_API_URL`.

## Later

- **Store price engine:** one price-source adapter per store, with sale prices and their end dates.
  - Stores to be listed.
  - Check each store's terms first. Prefer official APIs, feeds or licensed data.
  - Never get around bot detection.
- **One store per card:** price a whole card at a single store, so the shopping list is one trip. Worth it once real store adapters exist; today pricing takes the cheapest real price across stores and names each line's store.
- **Stronger device proof** (App Attest on iOS, Play Integrity on Android) behind the anonymous device ID. Until then a reinstall gets a new ID, and the per-IP limits carry the load.
- **Serve the price table from storage** (R2 or KV) instead of the Worker's bundle, so a monthly refresh needs no backend redeploy.
- **Re-rank `manual-prices.csv`** by how often each group appears in real decks, instead of today's judgment order.
- **Compare model providers** by card validation failure rate, from the `card_validation` log lines (SPEC §16).
- **Paid tier:** unlimited decks, saved meals, photo logging, weekly plans (SPEC §14).
- **Halal beyond meat:** gelatin and other animal-derived ingredients in non-meat foods.
- **Everything in SPEC §15:** package size versus recipe amount, pantry memory between sessions, unit conversion, regional price differences, batch cooking, store APIs and per-store prices.
