# Compact: where Pantry stands

A short summary to pick up from at the start of a session. Updated after every push. The full detail lives in `SPEC.md`, `BACKLOG.md` and `STAGING-LOG.md`.

**Last updated:** 2026-11-24, branch `device-and-staging`.

## What the app does

- A meal app for people with very little money. Canada first. "Pantry" is a working name.
- **Onboarding, once:** goal, hard limits (halal, vegetarian, allergies), kitchen appliances, how many people, and province.
- **Home:** tap the food you have and enter a budget.
- **Deck:** the app deals six meal cards with photos. Swipe left to pass, right to pick. Rewind is free. Three decks a day on the free tier.
- **Meal screen:** what you have, what to buy and what it costs, what completes the meal, the method, and a shopping list to copy.
- **Tracking:** the picked meal's calories and protein count toward today. Body stats are asked only for cut, bulk or a health condition.

## Rules that never break

- The AI never states a price. Every dollar figure comes from the pricing code.
- Hard limits are absolute. Every card is checked, and a failing card is made again.
- Items are priced at the full pack you have to buy.
- Over budget is shown, never hidden.
- Every estimate shows "~".
- API keys stay on the server.

## How it's built

- **Phone app:** Expo (React Native), for iOS and Android.
- **Server:** a Cloudflare Worker with five routes: health, prices, deck, image and report.
- **AI for meals:** set by config. Staging uses Groq's free `gpt-oss-120b`.
- **Photos:** Workers AI flux-1-schnell, shrunk to 512 px WebP. The photo style is fixed on the server.
- **Shared code packages:** contract (data shapes), vocabulary (foods and prices), engine (asks the AI and checks cards), pricing, needs (daily targets) and backend.

## Build progress

- **Done:** steps 1 to 6. These are the data shapes, food list, recipe engine, needs calculator, all screens and pricing.
- **In progress, step 7 (real prices):** 111 of 196 items have a real price. The rest still show "Sample prices". Real prices come from StatCan monthly averages, a hand-entry sheet, and a weekly Giant Tiger and Walmart price collector.
- **Next for prices:** fill rows 1 to 83 of the hand-entry sheet (`tools/prices/manual-prices.csv`). That clears every "Sample prices" label.
- **Staging is live** and passes the smoke test: `npm run smoke`.

## Recent sessions

- **2026-11-24**
  - The price note shows a range when a card mixes months, such as "September to November 2026".
  - Added the staging smoke test (`npm run smoke`). It passed 8 of 8 and is logged as Run 10.
  - Added the allergen checker (`npm run allergens:check`). It compares our tags with Open Food Facts and only reports.
  - The allergen checker now retries when Open Food Facts is busy.
- **2026-11-07:** cards can only "use" food the user has. Anything else goes to the Buy list.
- **2026-11-06:** tight budgets now fit, and the first weekly price run happened.

## Open items, most urgent first

- **Allergen tags:** check the checker's leads against real labels. You decide every change. The leads are in `BACKLOG.md`.
- **Giant Tiger suggestions file:** 388 rows were removed by accident and restored on 2026-11-24.
- **Project Hammer:** ask permission to use their prices. It would add No Frills and more Walmart prices in Ontario.
- **Weekly prices:** run them by hand on the Sunday reminder.
- **Before launch:** pick an app name and logo, write the privacy policy, get a paid AI key with a spending limit, deploy to production, and decide on Workers Paid (about $5 a month).

## How to pick up

- Read this file, then the top of `BACKLOG.md`.
- Run `npm test` and `npm run e2e` to confirm everything is green.
- After any staging deploy, run `npm run smoke`.
