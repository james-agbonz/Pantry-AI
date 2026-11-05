# Backlog

Everything parked so far. `docs/SPEC.md` is what the app does; this is what's still to do around it. Move an item into the build order in `CLAUDE.md` when it's picked up, and delete it here when it's done.

## Before launch

- **Fill `tools/prices/manual-prices.csv` rows 1–83.** They clear every "Sample prices" label, halal users included (rows 84 onward only change swap options). Then run `npm run prices:import`.
  - Reference store: Luciano's No Frills, Toronto.
  - Row 1 is done: No Name canola oil 946 ml, $4.29, 2026-09-25. It reaches the table at the next `npm run prices:import`.
  - Browser lookups are paused until nofrills.ca is allowed in the Claude extension's site permissions.
- **Check allergen tags against real product labels.** The `contains` tags in `packages/vocabulary/data/groups.json` were set by hand.
- **Kitchen illustration licence.** The picture in the app (`assets/kitchen.webp`, from Perplexity) can't ship as is: Perplexity allows commercial use of generated images only on Enterprise Pro and Enterprise Max plans; Free, Pro and Max are personal use only (Perplexity Help Center, "Generating Images with Perplexity"). Before launch: regenerate it on a plan or tool whose terms allow commercial use, or commission one, with the same nine appliances spaced apart. Then remeasure the tap areas in `src/onboarding/kitchen.ts`.
- **See real photos in the app.** `httpImageSource` is wired and tested. Check on staging and on the iPhone once Workers AI's free allowance has come back (Run 8 ran out).
- **Photo style is plate-v4** for now (best so far, user's call 2026-11-04). Herbs on dishes that don't list them, look-alike foods and varying plate size are **parked** until the app is stable.
- **Workers Paid** (~$5 a month) for photos and CPU: decided later, once the app is stable. Until then the free tier's 10K neurons a day applies (about 10 decks of photos), with a 24-hour lockout when it runs out.
- **Photo judge:** score each eval photo automatically with a vision model (only the plate? right food? unlisted garnish?) instead of by eye, so `tools/eval` gives numbers. Check first that a free or cheap vision model is available.
- **Photo steps:** try 6 steps instead of 4 if photos still drift from their prompt. Costs more neurons per photo.
- **Privacy policy.** For problem reports, this wording matches what the app does:
  > *Report a problem.* If you send a report from Settings, we receive your message, the app version, your phone type (iOS or Android) and the app's random install ID, which isn't linked to your name or contact details. We don't receive your profile, meals or anything else you've told the app. Reports are stored with our hosting provider, Cloudflare, used only to fix problems, and deleted automatically after one year.
- **Privacy policy and terms: prices and AI.** Say prices are dated estimates (StatCan averages and a reference store), never store quotes. Say meals come from an AI model and photos are AI illustrations, list what's sent to the model, and note that free tiers may keep it. Say how location is used, if a province is added. See `docs/PRICE-SOURCES.md` › For the privacy policy.
- **Prices for the stores that refuse the collector** (No Frills, Superstore, Maxi, Food Basics, Super C, FreshCo, and Walmart, which refused at scale with HTTP 412): the owner is finding a way (hand entry, flyers, partnerships). The collector never works around a refusal. Still open: Project Hammer as a check, an Instacart link (docs/PRICE-SOURCES.md).
- **Schedule the weekly price run:** `npm run prices:weekly`, then commit `price-table.json` and redeploy the backend (the Worker bundles the table). Set `PRICE_BOT_CONTACT` to a contact you're happy for the stores to see.
- **More Giant Tiger matches:** 106 items have no checked product yet (`npm run prices:find -- --store gianttiger_ca`, then pick).
- **Appliance list:** the user is finalizing the required equipment. Update `Method` (contract), `APPLIANCES` (app), the icons and the kitchen illustration's brief to match.
- **API key** on a paid account with a spending limit, as `PANTRY_LLM_API_KEY` on the host. Staging is on Groq's free tier (`openai/gpt-oss-120b`), made-up test profiles only. The engine's samples were re-recorded from the staging model (Run 8); re-record again if the production model differs.
- **App name and logo.** Packages use `pantry` until then.
- **Deploy the Worker** (`npm run deploy -w @pantry/backend`, after `wrangler login`). Its `REPORTS` store already exists and is bound, so Report a problem works from the first production deploy, then measure a real deal's CPU time. Workers Free allows 10 ms per request; move to Workers Paid (~$5 a month) if it goes over. Point the app at it with `EXPO_PUBLIC_API_URL`.

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
