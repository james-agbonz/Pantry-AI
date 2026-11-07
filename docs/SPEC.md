# Pantry AI — product spec

Every decision below was confirmed with the product owner. Treat it as settled.

## 1. Who it's for

People barely getting by, or making just enough, who should still eat well. Canada first. Cooking for one by default.

## 2. The flow

1. **Onboarding** (once)
2. **Home** — tap what you have, enter a budget, "Deal me meals"
3. **Loading** — engine → validate → price → sort
4. **Deck** — six cards, swipe
5. **Pick one** — swiping right selects it. A selection is required: it's what feeds tracking
6. **Meal screen** — what you have, what to buy, what completes it, method
7. **Logged** — the meal's calories and protein count toward today

## 3. Onboarding

Every screen is required, and each has a one-tap way through.

| # | Question | Options |
|---|---|---|
| 1 | Goal (one) | Eat well on little · Cut · Bulk · Managing a condition → diabetes / blood pressure / anemia / kidney / other |
| 2 | Hard limits (many) | Halal · Vegetarian · No pork · No dairy · Nuts · Gluten · None, plus free text |
| 3 | Appliances (many) | A kitchen illustration; tap to highlight: stove/hotplate · oven · microwave · fridge · freezer · kettle · blender · air fryer · rice cooker/slow cooker. Knife, pan, bowl and plate are assumed |
| 4 | Cooking for | Defaults to 1 |
| 5 | Where you shop | Province or territory (13). Skip keeps prices Canada-wide. Only the province is asked, never a city, postal code or location, and it stays on the phone (sent with each deck request for pricing) |

**Body stats** — asked after the first meal is selected, only for cut, bulk or condition, and required for those goals: height, weight, age, sex, activity level, target weight. Only target weight may be left blank. Eat well never asks, so its `targets` stay `null`. They're asked right after the first meal is picked, before its meal screen opens, with no skip. Only the resulting targets are kept. They can be entered in cm and kg or in feet, inches and pounds, and are always stored metric; a number outside a plausible adult range is named with that range, in the units on screen.

**Settings** — edit goal, hard limits, appliances, cooking for and province with the onboarding controls, and "Redo my numbers" to enter body stats again. Changing the goal or condition clears the targets, since they were worked out for the old goal. Their only job is computing daily needs (section 8).

## 4. Home

- **What you have** — preset chips drawn from the vocabulary (section 6), in collapsible sections, one per family. A few common families start open; the rest start closed, so the screen never shows every group at once. No typing as the main input. A search sits on top: it finds groups by name, and anything it can't match is added as a free-text item (`have_other`).
- **Budget** — one number in CAD, for this session.
- **Deal me meals.**

## 5. The contract

### Engine input

```json
{
  "have": [{ "group": "rice" }, { "group": "corn" }],
  "have_other": [],
  "budget": 15,
  "goal": "eat_well | cut | bulk | condition",
  "condition": "diabetes | blood_pressure | anemia | kidney | other | null",
  "exclude": ["pork", "nuts"],
  "methods": ["stove", "microwave", "fridge"],
  "targets": { "kcal": 2400, "protein": 140 },
  "servings": 1,
  "deck": 6,
  "avoid": ["dish names passed this session"]
}
```

- `targets` is `null` when body stats are skipped; the engine steers by goal alone.
- `exclude` is absolute and checked after generation.
- `have_other` holds free-text items from the fallback search.

### Engine output — one card

```json
{
  "id": "",
  "name": "",
  "time_min": 25,
  "kcal": 560,
  "protein_g": 38,
  "uses": ["rice", "corn"],
  "missing": [
    { "group": "white_fish", "qty": "300g", "role": "needed" },
    { "group": "frozen_veg", "qty": "1 cup", "role": "completes" }
  ],
  "methods": ["stove"],
  "steps": [],
  "image_prompt": ""
}
```

- **needed** — the dish can't be made without it.
- **completes** — the dish works without it, but this makes it a nutritionally complete meal: protein, vegetables or fibre. Never seasoning, sauce, oil or anything added for flavour; those are `needed` or left out.
- The engine decides roles. It never outputs a price.
- `methods` lists the appliances the dish needs, from the same set as the input. Empty for a no-cook dish.

## 6. Vocabulary and prices

Three levels: **family** (fish) → **group** (white fish) → **item** (basa fillets, frozen, 400g).

```json
{ "id": "white_fish", "family": "fish", "label": "White fish", "contains": ["fish"] }

{ "id": "basa_frozen", "family": "fish", "group": "white_fish",
  "name": "Basa fillets, frozen", "unit": "400g" }

{ "item": "basa_frozen", "store": "nofrills_lucianos_toronto",
  "regular": 6.99, "sale": { "price": 4.99, "ends": "2026-10-05" },
  "source": "manual", "updated": "2026-09-25" }
```

- **Prices are separate from items.** Each price is one item at one **store**, with a regular price and an optional sale price that applies up to and including its end date. `ca_typical` is the national typical price (Statistics Canada, and placeholders); other stores are real stores. An item can have a price at several stores and must have at least one.
- **Sources:** `placeholder` (invented, never called typical), `statcan`, `manual` (hand-entered from a store, its record kept in `tools/prices/manual-prices.csv`), `store` (a store's own adapter, later).

- The engine asks for **groups**. It names a specific item only when the dish truly needs it (a salmon dish asks for `salmon`).
- Pricing resolves each group to its **cheapest item this month**.
- Groups never change; prices and items can. A monthly refresh changes data, never code.
- Tap an item on the meal screen to swap it for others in the same group.
- The engine's prompt receives the group list. Missing items must use existing groups.
- Target size: 150–200 items.
- **Halal** — meat items (poultry, beef, pork, lamb) carry `"halal": true | false`; nothing else does. Under the halal diet, a meat group resolves to its halal-certified items only, and a group with none (all pork, some cuts) is left out of the group list the engine and validator see.
- **Nuts** — nuts and nut butters, peanuts included, are one `nuts` family, so excluding `nuts` catches them by family.
- **Allergens** — every group carries `contains`: Health Canada's priority allergens plus gluten — `peanuts`, `tree_nuts`, `sesame`, `milk`, `eggs`, `fish`, `shellfish` (crustaceans and molluscs), `soy`, `wheat`, `mustard`, `sulphites`, `gluten`. Tags are set by hand per group, never by name matching (rice noodles: none; soy sauce: soy, wheat, gluten). They cover every item in the group, including typical "may contain" labelling. `[]` means checked and none. Every wheat group is also gluten.

**Matching StatCan to items.** An item takes a StatCan price only when the product is the same item and size, or when it's sold by weight and StatCan gives a per-kilogram price (meat, bananas): price = per-kg × the pack's stated weight. Never rescaled sizes (a small pack costs more per kilo, so scaling down understates the till), never per-piece guesses, never StatCan's loose-produce per-kg for bagged produce (it overstates), never an all-cuts average for a pricier cut (it understates), and never a regular product for a halal item. Everything else is entered by hand in `tools/prices/manual-prices.csv` with its source and date, in the order that clears the most "sample" cards first.

**Price source.** Baseline candidate: Statistics Canada table 18-10-0245-01, *Monthly average retail prices for selected products* — monthly, from retailer scanner data, national and by province. These are averages, not lowest prices: label them "typical prices". The list is limited and lags a month or two; gaps are filled by hand. Until then, prices are placeholders marked `"price_source": "placeholder"`.

## 7. Recipe engine

**Gets** the contract input and the group list, never prices. Each group may carry a cost band (`low`, `mid`, `high`): its cheapest item ranked against every other group's in the current price table, in thirds. Words only, so the model can favour cheap groups without ever seeing a dollar figure. When the budget is tight (it buys about 6 low-cost things or fewer: the budget over the median low-band price, from `@pantry/pricing`), the prompt also says how many things each dish may buy, as a count. **Returns** a deck of six cards.

Rules:
- Never uses anything in `exclude`
- Only uses allowed `methods`
- Missing items only from the group list, each tagged `needed` or `completes`
- Each dish aims at roughly a third of daily `targets`
- Respects `condition` (diabetes: steady carbs, low sugar; blood pressure: low sodium; anemia: iron-rich; kidney: lower protein)
- The six differ in protein, method or cuisine
- Avoids anything in `avoid`

**Validation** — nothing reaches the user unchecked. Every card is checked for: valid JSON, no excluded ingredient anywhere, every group exists, every method allowed, no flavour marked `completes`. A failing card is regenerated alone.

- *Excluded ingredient:* a card fails if any group it uses or is missing is excluded, belongs to an excluded family (`dairy` catches `cheese`), or has an excluded `contains` tag (`gluten` catches `soy_sauce`), or if an exclude term appears as a word anywhere in its text (name, groups, steps, image prompt). Group names in the text are masked first and judged by their family and `contains` tags like any other group, so "coconut milk" passes No dairy and "soy sauce" in a step fails Gluten. A term that is a family or tag judges groups only that way; a free-text term ("chicken") also matches words in group names. An exclude term never matches inside a "-free" compound ("meat-free", "dairy-free"). Diets such as vegetarian are expanded into terms by the constraint builder before they reach `exclude`; halal acts on items instead (§6). Hard limits map to terms that hit both family and tags: No dairy → `dairy`, `milk`; Nuts → `nuts`, `peanuts`, `tree_nuts`; Gluten → `gluten`.
- *Group exists:* every `missing` group is in the group list. Each `uses` entry is a group or a `have_other` item.
- *Uses only what the user has:* a `uses` group the user didn't say they have is moved to `missing` as `needed` before the other checks, so it's priced and on the shopping list. The card isn't rejected for it.
- *Method allowed:* every card `methods` entry is in the input `methods`.
- *Completes is food, not flavour:* no `completes` item is a flavour group. Flavour groups are every group in the spices, condiments, oils and baking families, plus groups marked `"flavour": true` by hand (garlic, green onion, tomato paste, lemon, soy sauce, broths).

**Nutrition** — calories and protein are the model's estimates in v1, shown with `~`. Later: nutrition per group in the table, computed like prices.

## 8. Needs calculator

1. **Baseline** (Mifflin-St Jeor)
   - men: `10 × kg + 6.25 × cm − 5 × age + 5`
   - women: `10 × kg + 6.25 × cm − 5 × age − 161`
   - other or skipped sex: average of the two
2. **× activity** — mostly sitting 1.2 · light 1.375 · moderate 1.55 · very active 1.725
3. **Goal**

| Goal | Calories | Protein (g per kg) |
|---|---|---|
| Eat well | maintenance | 1.0 |
| Cut | −15% | 1.8 |
| Bulk | +10% | 1.8 |
| Managing a condition | maintenance | 1.0 |

   - Cut floor: never below 1500 kcal for men, 1200 for women, 1350 (the average) for other or skipped sex.
   - Protein is per kg of current weight. On a cut with a target weight below current weight, it's per kg of target weight instead. Calories stay the fixed percentages above; there is no timeline input.
4. **Condition**
   - Kidney: protein ~0.8 g/kg — overrides the goal.
   - Diabetes, blood pressure, anemia: passed to the engine as dish rules.

Output becomes `targets`. No body stats (Eat well, or before the first meal) → `targets: null`.

## 9. Pricing

**Gets** one card's `missing` list, the budget and the price table.

1. **Resolve** each group to its cheapest item.
2. **Price** at the full minimum sellable unit. Seasoning is $7 even if the dish needs a pinch.
3. **Merge** the same group appearing twice on one card.
4. **Fill the budget** — every `needed` first, then `completes` in order. A `completes` item that doesn't fit is skipped; cheaper ones after it may still fit.
5. What's left over becomes **to complete**.

```json
{
  "buy": [
    { "group": "white_fish", "item": "Basa fillets, frozen", "unit": "400g", "price": 6.49, "role": "needed" },
    { "group": "seasoning", "item": "Seasoning blend", "unit": "250g", "price": 7.00, "role": "needed" }
  ],
  "to_complete": [{ "group": "frozen_veg", "item": "Frozen mixed veg", "unit": "750g", "price": 2.00 }],
  "total": 13.49,
  "budget": 15,
  "over_by": 0,
  "complete_cost": 2.00,
  "placeholder": false,
  "as_of": "2026-07"
}
```

- Each line carries its `group` (the meal screen swaps within it) and the item's `unit` (the shopping list names it).
- `needed` alone over budget → the card still shows with `over_by`. Never hidden, never blocked.
- Tax is ignored: basic groceries are zero-rated in Canada.
- Every figure displays with `~`, and each money screen says once where the prices stand: "Typical prices, July 2026" (the month of the oldest price on the card, `as_of`, since StatCan runs a couple of months behind). While any price on a card is a placeholder (`"placeholder": true`), it says instead that they're sample prices for testing, not real: invented numbers are never called typical.
- **Regional prices.** With a province, the prices that apply there are used: stores with no province list (the national average, online stores) everywhere, stores with a list only in those provinces. A provincial StatCan average replaces the national one for that item, so a dearer province never gets the cheaper national figure. Without a province, only the prices that apply everywhere. Nunavut has no StatCan figures and uses the national ones. Cost bands for the engine (§7) follow the same rule.
- Within a group, a real price always beats a placeholder, however cheap; a placeholder is used only when the group has no real price. Money is added up in whole cents. Among items at the same price, the lowest item id wins, so results never shift between runs.

## 10. The deck

- The budget belongs to the session. Every card is an alternative costed against the same budget.
- **Order:**
  1. Fits including the complete-the-meal items
  2. Fits, but needs the extra to be complete
  3. Over budget, least over first
  - Within a tier, closest to the protein target first.
- Pricing finishes before the deck shows, because it decides the order.
- **Swipe right** selects the meal: the deck ends, the meal screen opens, the meal is logged.
- **Swipe left** passes, for this session only. A new session starts fresh.
- **Rewind** — always visible, unlimited, free.
- Everything passed → a new deck that avoids those dishes, counted against the daily limit.
- Counter on screen: "3 of 6 · 2 decks left today".

## 11. Images

- Flux Schnell, through the app's own backend so the key stays on the server. On Workers AI the model takes only a prompt and a step count (4), so the photo comes back at the model's own size (1024×1024 JPEG, ~400–600 KB). The server shrinks it to 512×512 WebP (~10–25 KB) with Cloudflare Images before sending it (`IMAGE_RESIZE`, `IMAGE_QUALITY`); if the resize fails, the original is sent. The phone scales it into the card.
- Prompt comes from the card's `name` and `image_prompt`. The model's `image_prompt` describes only the food (visible ingredients, named plainly); the server adds the photo style, so every photo matches.
- All six fire at once; the top card is requested first.
- The card shows immediately with a `surface-soft` placeholder; the photo fades in.
- A failed image never blocks a card: show a plain fallback.
- About $0.02 per deck.
- **Photo style:** one round white plate, camera at 45°, the same size and position in every photo (the middle two-thirds of the frame), on a plain flat light-grey background. (flux-1-schnell on Workers AI takes only a prompt and steps, so there is no seed to fix the framing.) Nothing else in frame: no cutlery, glasses, hands, appliances or table, and no garnish the dish doesn't list. Soft side light.
- **Generous and appetising, but true to the recipe's portion.** A heaped, full serving that covers most of the plate; browned, glossy, steaming, vibrant. Cheap food should look good, never meagre. Never bigger than the recipe makes: the user cooks it, and the card's calories and protein are for that serving.

## 12. Meal screen

- **You have:** rice, corn
- **Buy:** basa ~$6.49 · seasoning ~$7.00 — ~$13.49 of $15
- **To complete:** frozen veg ~$2.00
- Tap a bought item to swap it within its group
- Method steps
- **Copy shopping list** — plain text to take to the store

## 13. Tracking

- Selecting a meal logs its calories and protein toward today's targets.
- **Free:** logged from the selected meal.
- **Paid:** snap a photo of anything else eaten, Cal AI style.
- No streaks, no red numbers, no punishment for gaps. Average whatever days exist.

## 14. Free and paid

Charge for what costs money to run, never for what the user needs.

| Free | Paid |
|---|---|
| Unlimited rewinds | Unlimited decks |
| 3 decks a day | Save meals |
| New decks avoid passed dishes | Photo logging |
| Logging from selected meals | Weekly plans |

## 15. Out of scope for v1

- Package size versus recipe amount — the minimum sellable unit is the price
- Pantry memory between sessions — only what the user has right now
- Unit conversion — the client's job
- Prices finer than a province (a city, a branch)
- Batch cooking
- Store APIs; per-branch prices (stores are read online, at each site's default prices)

## 16. Architecture

```
Profile ─┐
         ├─> Constraint builder ─> Recipe engine ─> Validation ─┬─> Pricing ─> Sort ─> Deck
Session ─┘       (contract)          (groups only)              │     ^
                                                                │  Price table (monthly)
                                                                └─> Images (Flux, via backend)
```

Backend endpoints: `POST /api/deck` runs constraint builder → engine → validation → pricing → sort; `POST /api/image` proxies Flux. All keys server-side.

### Price table

Prices and items change monthly; groups never do. So the price table is versioned data, separate from the app:

- **One table, versioned by publish date.** `{ "schema": 2, "version": "2026-09-25", "stores": [...], "items": [...], "prices": [...] }` (§6). The version is the day the table was published (`YYYY-MM-DD`), so a later table always compares as newer. The placeholder table is `2026-09-01`. Every item must have a price; a table that doesn't fit the groups is refused, naming the problem.
- **The app fetches it** from the backend (`GET /api/prices`, suggested) and caches the last good copy. A copy is bundled with the app as the fallback. Order of preference: a freshly fetched table that checks out; else the cached one if it's at least as new as the bundled one; else the bundled one. A monthly refresh reaches phones without an app release.
- **One pricing module** (`@pantry/pricing`) runs on the server for decks and on the phone for swaps, over whichever table is in use. It prices on a given day (the phone's local date), so a sale stops applying the day after it ends, even from a cached table. A real price at any store beats a placeholder; otherwise the cheapest price on the day wins, and each line names its store.
- **Price sources are adapters** (`tools/prices`), chosen by `PRICE_SOURCES` like `LLM_PROVIDER`: StatCan national (`statcan`) and provincial (`statcan_provinces`), the manual CSV (`manual`), and the weekly store collector (`walmart_ca`, `gianttiger_ca`). The import merges them and refuses two prices for one item at one store. Run weekly with `npm run prices:weekly`.
- **The store collector** reads each store's online prices for the products a person has matched to our items (`store-map.json`, via `prices:find` and `prices:pick`; only the item's own size, halal only for halal items). It identifies itself as `PantryPriceBot` (plus `PRICE_BOT_CONTACT`), keeps out of what robots.txt disallows, waits between requests, and stops at a site's first refusal. It never disguises itself or works around blocking. Walmart's terms bar automated collection; the owner accepted that risk (docs/PRICE-SOURCES.md). A sale it sees is trusted for 6 days, so a missed week falls back to the regular price.
- **Where the table lives:** the Worker serves the table bundled with it, so a monthly refresh is a data commit and a backend redeploy, and no app release.

### API (Cloudflare Worker)

- **`POST /api/deck`** — body `{ profile, session, local_date }`, header `X-Pantry-Device`. Streams one JSON line per stage as it finishes (`reading` → `building` → `pricing` → `sorting`), then `{ "deck": [...], "left": 2 }`, so Loading ticks with the real work, never on a timer. Refusals are `429 {"error": "daily_limit" | "rate_limit"}`, `503 {"error": "busy"}`, `400` for a bad request or date; a failure after streaming starts is an `{"error": "server" | "no_cards"}` line.
- **`POST /api/image`** — body `{ name, prompt }` (the card's name, up to 120 characters, and its `image_prompt`, up to 1,200; the server wraps them in the photo style, §11), header `X-Pantry-Device`. Answers `{ "url": "data:image/jpeg;base64,…" }`, or `{ "url": null }` when the photo failed and the card shows its fallback. Capped per IP per minute (`429 {"error": "rate_limit"}`); photos don't count against the device's decks.
- **`POST /api/report`** — Settings › Report a problem. Body `{ message, app_version, platform }` (message up to 2,000 characters; platform `ios`, `android` or `web`), header `X-Pantry-Device`. Stored in Workers KV (`REPORTS`) with the time and device ID; nothing else about the user. Each report is deleted after `PANTRY_REPORT_TTL_DAYS` (default 365). `201 {"ok": true}`, `429 {"error": "rate_limit"}` past 3 a minute per IP, `503` where no store is bound. The message never goes into the log. Read them with `npm run reports -w @pantry/backend`.
- **`GET /api/prices`** — the current price table; its version is the ETag, so an unchanged table is a `304`.
- **`GET /api/health`**.

**Limits, on the server** (the phone's count is only for display):

| Limit | Default | Why |
|---|---|---|
| Decks per device per day | 3 | §14. The device is an anonymous random ID made on first launch |
| Decks per IP per minute | 5 | Stops scripted hammering |
| Decks per IP per day | 200 | A tripwire only: carriers and student residences put many real users behind one IP |
| All decks per day | 2,000 | Circuit breaker in front of the Console spending limit; answers `busy` |
| Photos per IP per minute | 40 | Six a deck, five decks a minute, with room. Photos cost per call |
| Problem reports per IP per minute | 3 | Enough for a person, not a script |

- **The day** is the phone's local date, accepted within a day either side of the server's, and a device's date only moves forward: claiming yesterday after using today's decks still counts against today.
- **A slot is given back only when the server fails** (the model errors, or every card is dropped). Never when the phone disconnects: the model cost is already spent.
- Every limit comes from config (`PANTRY_LIMIT_*`). The counters live in one Durable Object, which handles one call at a time, so two deals can't both take the last slot.
- The key never appears in a response or a log line; the server redacts it from anything it logs.

### Providers and config

The model and the image generator sit behind two interfaces, so either can be swapped without code changes:

- **`LlmClient`** (`@pantry/engine`) — `complete({ system, user }) → text`. The engine owns the prompts; an adapter only moves text. Adapters live in `@pantry/backend`: `anthropic`, `openai-compatible` (any OpenAI chat-completions API, such as Groq) and `mock` (a recorded sample deck, offline).
- **`ImageClient`** (`@pantry/backend`) — `generate(prompt) → { url } | null`; `null` shows the card's fallback. Adapters: `workers-ai` (Cloudflare Workers AI through the Worker's `AI` binding, so no key) and `mock`.

Chosen by environment variables, read only by the backend:

| Variable | Values | Notes |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` · `openai-compatible` · `mock` | Default `mock` |
| `LLM_MODEL` | e.g. `claude-sonnet-5`, `openai/gpt-oss-120b` | Required for a real provider. No model id is hard-coded |
| `LLM_BASE_URL` | e.g. `https://api.groq.com/openai/v1` | Required for `openai-compatible` |
| `PANTRY_LLM_API_KEY` | the provider's key | Required for a real provider |
| `IMAGE_PROVIDER` | `workers-ai` · `mock` | Default `mock` |
| `IMAGE_MODEL` | e.g. `@cf/black-forest-labs/flux-1-schnell` | Required for `workers-ai` |
| `IMAGE_STEPS` | 1–8 | Default 4 |
| `IMAGE_RESIZE`, `IMAGE_QUALITY` | px 64–1024; 1–100 | Unset: no resize. Staging: 512 px WebP, quality 75 (needs the `IMAGES` binding) |
| `PANTRY_LIMIT_DEVICE_PER_DAY`, `_IP_PER_DAY`, `_IP_PER_MINUTE`, `_GLOBAL_PER_DAY`, `_IMAGES_IP_PER_MINUTE`, `_REPORTS_IP_PER_MINUTE` | numbers | Defaults 3, 200, 5, 2000, 40, 3 |
| `PANTRY_ALLOWED_ORIGINS` | comma-separated origins | Browsers allowed to call the API (the Expo web dev page). Empty in production |
| `EXPO_PUBLIC_API_URL` (app) | the API's address | Unset: the app runs on mocks, offline |

- **Keys** come from `process.env`. On a host, the platform injects them. In dev, the repo's `.env` (gitignored) is loaded with Node's `--env-file`. The key is named `PANTRY_LLM_API_KEY`, not `ANTHROPIC_API_KEY`, so tools that read the standard name (Claude Code among them) never pick it up.
- **Free tiers get made-up test profiles only.** A provider's free tier may keep or train on what it's sent, so an environment on one (staging, on Groq) never sees a real user's profile or session.
- **Validation failure rate.** Every deck logs one line: `{"event":"card_validation","provider","model","validated","failed","rate"}`, counting every card checked, retries included. Aggregating these lines compares providers and models.
