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

## Open decisions — ask the user before scaffolding

- Stack. Suggested: Expo (React Native) for iOS + Android, with a small serverless backend. Not yet confirmed.
- App name.

## Rules that must never break

- The recipe engine never states a price. Every dollar figure comes from the pricing module.
- `exclude` is absolute. Every generated card is checked after generation; a failing card is regenerated alone.
- Items are priced at their full minimum sellable unit, never a fraction.
- Over budget is shown, never hidden, never blocking.
- Every estimated number displays with `~`.
- API keys live on the server only. Never in the client, never committed.

## Keys and cost

- The app's Anthropic key goes in `.env` (gitignored), read only by the backend. Do not export `ANTHROPIC_API_KEY` in the shell: Claude Code would bill API usage instead of the subscription.
- Image generation (Flux) key: same rule.
