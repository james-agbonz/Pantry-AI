# Pantry AI

A meal app for people getting by on very little. The user says what food they have and what they can spend; the app deals six meal cards, they swipe, pick one, and see exactly what to buy and what it costs. Canada first.

Pantry is a working name.

## Read before any work

- `docs/SPEC.md` — every product decision. It is settled; don't redesign it. If something is missing or contradictory, ask.
- `docs/DESIGN.md` — brand book and UI rules.
- `design/tokens.json` — colours, type, spacing, radius. Use tokens, never raw values.

## Build order — one piece at a time, confirm before moving on

1. Contract — types and runtime validation for the engine's input and output
2. Vocabulary — families → groups → items, price column left empty
3. Recipe engine + validation
4. Needs calculator
5. Screens — 5a app shell and onboarding · 5b home and deck · 5c meal screen
   - To do before launch: the kitchen illustration on the appliances screen (tiles with outline icons stand in; DESIGN.md › Imagery)
6. Pricing math, tested with placeholder prices marked as such
7. Real prices — data change only, no code change: replace the figures and `price_source` in `data/price-table.json` and bump its `version`
   - To do: check allergen tags against real labels (`contains` in `packages/vocabulary/data/groups.json` was set by hand)

## Stack (confirmed)

- Expo (React Native) for iOS + Android, with a small TypeScript serverless backend.
- npm workspaces under `packages/` and `apps/`. Shared code is `@pantry/*`.
- npm 11.6.1 or later, enforced by `devEngines` in `package.json` (npm 11.6.0 and earlier refuse to run here). npm 11.5–11.6.0 marked the optional platform binaries of peer-only packages (rolldown under vite) as peer, then pruned them on the next install, breaking vitest. `allowScripts` records which install scripts run; esbuild's and fsevents' are denied because neither is needed.
- Zod for runtime validation; types are inferred from the schemas. Vitest for tests.
- `packages/contract` — engine input, card output, card validation, and the onboarding profile and session (SPEC §3–§5, §7).
- `packages/vocabulary` — families → groups → items (SPEC §6). `data/groups.json` never changes; `data/price-table.json` is the versioned monthly table (items and prices), checked on load. A monthly refresh edits only the price table, and the app fetches it from the backend (SPEC §16), so no release is needed.
- `packages/pricing` — pricing and deck sort (SPEC §9, §10), in whole cents. Pure; runs on the server and on the phone for swaps.
- `packages/engine` — constraint builder and recipe engine (SPEC §7). Pure logic; talks to a model only through the `LlmClient` interface.
- `apps/mobile` — the Expo app (expo-router, routes in `src/app/`). Theme comes from `design/tokens.json` via `src/theme`; a test fails on raw colours or sizes elsewhere. Vitest covers pure helpers. `npm run e2e` clicks through the real app in Expo web with Playwright (onboarding, deck, meal, settings, and a responsiveness check that catches render loops); run it before merging screen changes. First time: `npx playwright install chromium` in `apps/mobile`. Decks and photos come through `DeckSource` / `ImageSource` (`src/data`); until `/api/deck` exists they're mocks in `src/mock`, whose prices are placeholders and whose pricing and sort are stand-ins for step 6. Root `overrides` pins one copy of react-native-reanimated and react-native-worklets (expo-router otherwise pulls a second, newer one). Pins TypeScript ~6.0 because Expo SDK 57 requires it; the packages use 7.
- `packages/needs` — needs calculator: body stats → daily `targets` (SPEC §8).
- `packages/backend` — config, model and image adapters (SPEC §16). The only package that reads env or holds keys. `npm run deal -w @pantry/backend` deals one deck; offline by default.

## Open decisions — ask the user before scaffolding

- App name. Packages use `pantry` until then.

## Rules that must never break

- The recipe engine never states a price. Every dollar figure comes from the pricing module.
- `exclude` is absolute. Every generated card is checked after generation; a failing card is regenerated alone.
- Items are priced at their full minimum sellable unit, never a fraction.
- Over budget is shown, never hidden, never blocking.
- Every estimated number displays with `~`.
- API keys live on the server only. Never in the client, never committed.

## Keys and cost

- Provider and model come from config (`LLM_PROVIDER`, `LLM_MODEL`, `IMAGE_PROVIDER`), never from code. See SPEC §16.
- The app's model key is `PANTRY_LLM_API_KEY`, read from `process.env` by the backend only: from `.env` (gitignored) via `--env-file` in dev, and injected by the host in production. Claude Code only reads `ANTHROPIC_API_KEY`, so the app key can't be picked up by it. Never name the app key `ANTHROPIC_API_KEY`.
- Image generation key: same rule, with its own `PANTRY_*` name when a real adapter is added.
