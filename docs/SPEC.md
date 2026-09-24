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

**Body stats** — asked after the first meal is selected, only for cut, bulk or condition: height, weight, age, sex, activity level, target. Their only job is computing daily needs (section 8).

## 4. Home

- **What you have** — preset chips grouped by family, drawn from the vocabulary (section 6). No typing as the main input. A small "something else" search is the fallback.
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
- **completes** — the dish works without it, but this makes it a proper meal.
- The engine decides roles. It never outputs a price.
- `methods` lists the appliances the dish needs, from the same set as the input. Empty for a no-cook dish.

## 6. Vocabulary and prices

Three levels: **family** (fish) → **group** (white fish) → **item** (basa fillets, frozen, 400g).

```json
{ "id": "basa_frozen", "family": "fish", "group": "white_fish",
  "name": "Basa fillets, frozen", "unit": "400g",
  "price": null, "price_source": "placeholder", "updated": null }
```

- The engine asks for **groups**. It names a specific item only when the dish truly needs it (a salmon dish asks for `salmon`).
- Pricing resolves each group to its **cheapest item this month**.
- Groups never change; prices and items can. A monthly refresh changes data, never code.
- Tap an item on the meal screen to swap it for others in the same group.
- The engine's prompt receives the group list. Missing items must use existing groups.
- Target size: 150–200 items.
- **Halal** — meat items (poultry, beef, pork, lamb) carry `"halal": true | false`; nothing else does. Under the halal diet, a meat group resolves to its halal-certified items only, and a group with none (all pork, some cuts) is left out of the group list the engine and validator see.
- **Nuts** — nuts and nut butters, peanuts included, are one `nuts` family, so excluding `nuts` catches them by family.

**Price source.** Baseline candidate: Statistics Canada table 18-10-0245-01, *Monthly average retail prices for selected products* — monthly, from retailer scanner data, national and by province. These are averages, not lowest prices: label them "typical prices". The list is limited and lags a month or two; gaps are filled by hand. Until then, prices are placeholders marked `"price_source": "placeholder"`.

## 7. Recipe engine

**Gets** the contract input and the group list, never prices. **Returns** a deck of six cards.

Rules:
- Never uses anything in `exclude`
- Only uses allowed `methods`
- Missing items only from the group list, each tagged `needed` or `completes`
- Each dish aims at roughly a third of daily `targets`
- Respects `condition` (diabetes: steady carbs, low sugar; blood pressure: low sodium; anemia: iron-rich; kidney: lower protein)
- The six differ in protein, method or cuisine
- Avoids anything in `avoid`

**Validation** — nothing reaches the user unchecked. Every card is checked for: valid JSON, no excluded ingredient anywhere, every group exists, every method allowed. A failing card is regenerated alone.

- *Excluded ingredient:* a card fails if any group it uses or is missing is excluded, or belongs to an excluded family (`dairy` catches `cheese`), or if an exclude term appears as a word anywhere in its text (name, groups, steps, image prompt). Diets such as halal or vegetarian are expanded into ingredient terms by the constraint builder before they reach `exclude`.
- *Group exists:* every `missing` group is in the group list. Each `uses` entry is a group or a `have_other` item.
- *Method allowed:* every card `methods` entry is in the input `methods`.

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

   - Cut floor: never below 1500 kcal for men, 1200 for women.
4. **Condition**
   - Kidney: protein ~0.8 g/kg — overrides the goal.
   - Diabetes, blood pressure, anemia: passed to the engine as dish rules.

Output becomes `targets`. No body stats → `targets: null`.

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
    { "item": "Basa fillets, frozen", "price": 6.49, "role": "needed" },
    { "item": "Seasoning blend", "price": 7.00, "role": "needed" }
  ],
  "to_complete": [{ "item": "Frozen mixed veg", "price": 2.00 }],
  "total": 13.49,
  "budget": 15,
  "over_by": 0,
  "complete_cost": 2.00
}
```

- `needed` alone over budget → the card still shows with `over_by`. Never hidden, never blocked.
- Tax is ignored: basic groceries are zero-rated in Canada.
- Every figure displays with `~`, and each money screen says once that prices are typical, not quotes.

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

- Flux Schnell, through the app's own backend so the key stays on the server.
- Prompt comes from the card's `image_prompt`.
- All six fire at once; the top card is requested first.
- The card shows immediately with a `surface-soft` placeholder; the photo fades in.
- A failed image never blocks a card: show a plain fallback.
- About $0.02 per deck.
- **Prompt rule:** home cooking on a normal plate, realistic portion, kitchen light. A $4 dinner must not look like a $30 one.

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
- Regional price differences
- Batch cooking
- Store APIs and per-store prices

## 16. Architecture

```
Profile ─┐
         ├─> Constraint builder ─> Recipe engine ─> Validation ─┬─> Pricing ─> Sort ─> Deck
Session ─┘       (contract)          (groups only)              │     ^
                                                                │  Price table (monthly)
                                                                └─> Images (Flux, via backend)
```

Backend endpoints (suggested): `POST /api/deck` runs constraint builder → engine → validation → pricing → sort; `POST /api/image` proxies Flux. All keys server-side.
