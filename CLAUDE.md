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
5. Screens
6. Pricing math, tested with placeholder prices marked as such
7. Real prices — data change only, no code change
   - To do: check allergen tags against real labels (`contains` in `packages/vocabulary/data/groups.json` was set by hand)

## Stack (confirmed)

- Expo (React Native) for iOS + Android, with a small TypeScript serverless backend.
- npm workspaces under `packages/`. Shared code is `@pantry/*`.
- Zod for runtime validation; types are inferred from the schemas. Vitest for tests.
- `packages/contract` — engine input, card output, card validation (SPEC §5, §7).
- `packages/vocabulary` — families → groups → items (SPEC §6). Data lives in `data/*.json` and is checked on load; a monthly price refresh edits only those files.
- `packages/engine` — constraint builder and recipe engine (SPEC §7). Pure logic; talks to a model only through the `LlmClient` interface.
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
