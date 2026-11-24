# Staging log

One section per run on staging, newest first. Each records the config, the numbers, what the photos look like and what changed because of it. Append a section after every run; never edit an old one except to correct a figure (say so).

Staging runs on free tiers, so every profile here is made up (SPEC §16). Prices are the placeholder table unless a run says otherwise.

How a run is measured: decks go to `POST /api/deck` from a script, each with its own random device ID, about 65 s apart (Groq's free tier allows 8K tokens a minute). Validation and token figures come from `wrangler tail --env staging`: the `card_validation` and `llm_call` lines. Photo figures come from `POST /api/image` responses.

---

## Run 10 — 2026-11-24: first smoke test

**Config:** as Run 9, plus `as_of_latest` on every card's pricing (the price note can now read "September to November 2026"). Worker `dce0cd19`. Price table `2026-11-06`. One `npm run smoke` against staging.

- **8 of 8 checks passed:** health, price table (935 prices), a deck of 6 with none dropped, every card priced, "uses" only what the profile has, 3 of 3 photos, a problem report, and a deck refused without a device ID.
- **Deck time:** 9.4 s. **Photos:** 1.9 s, 2.2 s and 12.6 s (the slow one is likely a cold start).
- The smoke test leaves one report marked "smoke test" in `REPORTS`.

**Verdict:** keep. Run `npm run smoke` after every staging deploy.

## Run 9 — 2026-11-06: how many things a tight budget buys

**Config:** as before, plus `affordableItems` (`@pantry/pricing`): the budget over the median low-band price, as a count. When it's 6 or fewer, the prompt says each dish may buy at most that many things. Worker `e8e203e1`. Price table `2026-11-06` (the first weekly job run). Decks only, from the 3 tight profiles, via `tools/eval/run.mjs`.

| Profile | Count told to the model | Over budget | Run 3 (cost bands only) | Run 1 |
|---|---|---|---|---|
| Halal, $8 | 4 | **0 of 6** | 0 of 6 | 5 of 6 |
| Blood pressure, instant noodles, $5 | 2 | **0 of 6** | 0 of 6 | 3 of 6 |
| Microwave + kettle, $6 | 3 | **0 of 6** | 6 of 6 (worst ~$8.83) | 2 of 6 |

- Each dish bought 1 to 3 things; totals from ~$1.37 to ~$6.62.
- The $6 deck leans hard on tuna, which that profile has. Variety may suffer on very tight budgets; worth watching.
- One deck per profile: a strong signal, not proof.

**Verdict:** keep.

## Run 8 — 2026-11-05: recording the engine's test samples

**Config:** as Run 7, plus photos in the app (`httpImageSource`) and Report a problem. Worker `5dec9096`. Three decks with the engine tests' own input, made up, about 65 s apart; replies captured from `wrangler tail`.

- **Deck 1:** two real faults, `green_onion` marked `completes`. Both regenerated alone and passed (8 validated, 2 failed). One regeneration needed the 429 retry.
- **Deck 2:** clean, 6 of 6 (now `clean-deck.json`).
- **Deck 3:** two real faults, `egg` for the group `eggs`. The regenerations went out in parallel and hit Groq's 8K tokens a minute: **the deck failed with `HTTP 429 after one retry`**. The slot was released, as designed. On the free tier, a deck with failed cards close behind another deck can fail. The paid key, or spacing regenerations, would fix it.
- **Photos in the app:** every card asked `/api/image` (6 of 6 answered 200), but the free 10K neurons were used up by Runs 2–7, so each answer was `url: null` and the cards showed the plain fallback, as designed. Real photos in the app weren't seen yet.

The samples and what's real or injected are listed in `packages/engine/test/fixtures/README.md`.

## Run 7 — 2026-11-04

**Review page:** https://claude.ai/artifact/1jp7QPbPVTzTygrL4AUVKX (Runs 6 and 7 together)

**Config:** plate-v4 (commit `1540f37`), plus a server-side resize: each photo is shrunk to **512×512 WebP, quality 75**, with Cloudflare Images (the Worker's `IMAGES` binding, `ResizingImageClient`), set by `IMAGE_RESIZE` and `IMAGE_QUALITY`. Worker version `7f2ab367`. Photos only, from the 12-dish set.

| | v4, no resize (Run 5) | v4 + resize |
|---|---|---|
| Median size | 494 KB | **13 KB** |
| Largest | 608 KB | 26 KB |
| Median time | 1.5 s | 2.8 s |
| Slowest | 4.9 s | 8.5 s |

- **About 38× smaller.** A deck's six photos drop from ~3 MB to ~80 KB of mobile data.
- **Quality:** checked at full 512 px. It holds up at card size: the stew looks as good as before, with a little softening in fine texture.
- **Slower:** the resize adds about 1.3 s per photo in the median, up to ~4 s at worst. All six photos fire at once and the card shows a placeholder until its photo fades in (SPEC §11), so nothing waits on it, but the photo arrives later.
- **Fallback:** if Cloudflare Images refuses, for example after 5,000 resizes in a month on the free plan (error 9422), the original JPEG is sent instead. Tested with a fake binding, not yet seen live.
- **Photos vary run to run.** Every run draws new photos, so one dish can look different between runs for reasons that have nothing to do with the change (the lentil soup came out as a small portion this time). Comparisons across runs carry that noise.

**Verdict:** keep the resize.

## Run 6 — 2026-11-04 (reverted)

**Review page:** https://claude.ai/artifact/1jp7QPbPVTzTygrL4AUVKX (Runs 6 and 7 together)

**Config:** plate-v5, tried on Worker `15576758`. The plate sentence moved straight after the dish, the plate shrank to "half the frame's width, with a wide margin of plain light-grey background on every side", and the style text was shortened (619 characters, against v4's 727). Photos only, from the 12-dish set.

| | v4 (Run 5) | v5 |
|---|---|---|
| Median size | 494 KB | 418 KB |
| Largest | 608 KB | 749 KB |

- **Plate size:** smaller on some (sardine noodles, chili, tacos, tuna noodles), unchanged on others (chicken thighs, stir-fry, porridge). Still not consistent.
- **Regressions on what matters most:**
  - The egg vanished from the fried rice again, which also became a small heap on a big plate: meagre again.
  - The lentil soup sat to one side, leaving half the plate empty.

**Verdict: reverted to plate-v4** (commit `1540f37`, redeployed as Worker `7a0a19c3`). Prompt wording looks to have reached its limit on layout: flux-1-schnell at 4 steps doesn't hold a plate size from words. Plate size and file size are better left to the server, so the next step is the 512 px resize.

## Run 5 — 2026-11-04

**Config:** as Run 4, with photo style `plate-v4`. Worker version `eca68a81`. Photos only, from the 12-dish set. Code as of commit `d71c1ac`, plus this change.

**Why:** after reviewing Run 4, the user ruled that the 45° angle isn't a problem, and that keeping every ingredient visible matters most.

**What changed:** the dish now opens the prompt (`{name}: {dish}`), because flux weighs the start of a prompt most. It's followed by "Every ingredient named here is clearly visible on the plate", then the v3 style unchanged. The description cap dropped to 1,200 characters so the whole prompt stays within 2,048.

**Review page:** https://claude.ai/artifact/6sUQocAVA4iDbAXq396L8A (v3 and v4 side by side)

| | v3 (Run 4) | v4 |
|---|---|---|
| Median size | 380 KB | **494 KB** |
| Largest | 445 KB | 608 KB |

All 12 generated. Median time 1.6 s.

Scored by eye:
- **Better, the goal of this round:** named ingredients show.
  - The egg is back in the fried rice.
  - The porridge shows porridge with chickpeas and carrot.
  - The frittata shows its cheese and spinach; the chicken plate shows its onion rings.
- **Worse:**
  - Plates came out bigger and fill more of the frame (chili, tacos, tuna noodles, stew, porridge). With the dish first, the plate-size wording carries less weight.
  - Size rose 30%.
- **No change:**
  - Herbs on the enchilada bake, chicken and stew.
  - The sardines are still unclear.
  - The tuna doesn't show clearly next to the egg.

**Verdict:** keep the dish-first prompt and the "every ingredient visible" line. Next: pin the plate size again, for example by moving the plate sentence straight after the dish, or asking for a wide grey margin. Size is now a reason to pick up the 512 px resize from BACKLOG.

## Run 4 — 2026-11-04

**Config:** as Run 3, with photo style `plate-v3`. Worker version `3ea182a0`. Photos only: the 12-dish set from `tools/eval/photo-set.json`, the same names and descriptions as Runs 2–3.

**Why:** the user found the photos looked small and meagre, "a poor person's meal". Decision (option 1): make the food generous and appetising but true to the recipe's portion, never bigger than it really is, with the plate size unchanged. SPEC §11 was updated to say so.

**What changed in the style:**
- Camera at 45° instead of overhead.
- Back to plate-v1's plain flat light-grey background.
- One generous, heaped serving covering most of the plate, true to a real portion.
- Looks fresh, juicy and delicious: golden-brown edges, glossy sauce, steam, vibrant colour.
- Soft side light.
- The plate stays 27 cm, filling the middle two-thirds of the frame.
- The engine's `image_prompt` rule now asks for the food at its most appetising, but only what the recipe really makes (it replaced "a cheap dinner must not look like an expensive one").
- The description cap dropped to 1,240 characters so the longer style still fits in 2,048.

**Review page:** https://claude.ai/artifact/Pd8kVSzLpbKC3aRdcZA9BJ (v1, v2 and v3 side by side)

| | v1 (Run 2) | v2 (Run 3) | v3 |
|---|---|---|---|
| Median size | 334 KB | 485 KB | **380 KB** |
| Largest | 426 KB | 583 KB | 445 KB |

Median photo time 1.4 s. All 12 generated.

Scored by eye:
- **Better:**
  - Fuller, glossier portions (chili, stew, tacos, stir-fry, chicken); nothing looks meagre now.
  - The background is grey again and the same on every photo.
  - The sardines look less like mussels.
- **Not fixed:**
  - The camera angle is 45° on only about a third of the photos; the rest stay overhead.
  - Plate size still varies (small tuna noodles, big fried rice).
  - Herbs still appear on the enchilada bake, tacos and porridge.
- **New problems:**
  - The egg is missing from "Egg & Chickpea Fried Brown Rice".
  - The porridge reads as a chickpea dish.
  - Asking for more on the plate made the model drop or blur named ingredients.
- **Size:** fuller plates carry more detail, so v3 sits between v1 and v2. The 512 px resize in BACKLOG remains the real fix for size.

**Reviewed by the user (2026-11-04):** agreed, and found this round a clear improvement over v1 and v2.

**Verdict:** keep v3. It answers the "meagre" complaint, and plate size, herbs and look-alike foods are no worse than before. Next: drop the 45° request (flux ignores it most of the time, which makes the set look inconsistent), and check that named ingredients survive.

## Run 3 — 2026-11-04

**Config:** as Run 2, plus photo style `plate-v2` and cost bands in the group list (`costBands`, `@pantry/pricing`). The `image_prompt` rule now also says nothing on the side, and to describe proteins that are easy to confuse. Worker version `983c19b2`. Run with `tools/eval/run.mjs` (fixed sets in `tools/eval/`).

**Review page:** https://claude.ai/artifact/U5UJfzcg675qm3fKDym9c6

**Seed refused.** The first deploy also sent flux a fixed `seed`. Workers AI rejected it with `5006: Additional or unevaluated properties '/seed' … not allowed`: flux-1-schnell's schema takes only `prompt` and `steps`, although Cloudflare's own example passes a seed. The seed was removed and the run re-done without it.

### Photos: the 12-dish set, plate-v1 against plate-v2

Each dish used the same name and description as in Run 2.

| | plate-v1 (Run 2) | plate-v2 |
|---|---|---|
| Median size | 334 KB | **485 KB (+45%)** |
| Largest | 426 KB | 583 KB |

Scored by eye on the fixed checklist:
- **Better:**
  - No fork beside the tacos.
  - No bowl sitting inside a plate (lentil soup).
  - No greens beside the tofu stir-fry.
  - The plate size is a little steadier.
- **No change:**
  - Sardines still look like mussels.
  - Herbs still appear on the enchilada bake, beef stew, egg fried rice and chicken thighs.
  - The oranges stay, because the set's old description lists them (the new rule should stop the model writing them).
- **Worse:**
  - The backdrop came out peach or pink rather than grey.
  - The size rose 45%. A bigger plate covered in food, plus a textured "paper" backdrop, gives the JPEG more detail to encode.

**Verdict:** keep the single plate and the "nothing beside the plate" wording. Revert the paper backdrop and the larger plate for size: plate-v1's flat light-grey background and smaller plate were cheaper and looked cleaner. Herbs and confusable proteins aren't fixed by wording alone.

### Budget: three tight profiles with cost bands

| Profile | Cards over | Worst overshoot | Run 1, same profile |
|---|---|---|---|
| Halal, $8 | **0 of 6** | — | 5 of 6, ~$17.92 |
| Blood pressure, instant noodles, $5 | **0 of 6** | — | 3 of 6, ~$0.21 |
| Microwave + kettle, $6 | **6 of 6** | ~$8.83 | 2 of 6, ~$3.23 |

- Validation 0 of 18 failed, no regenerations. ~1.6–1.9K tokens in (the bands add ~250), 3.1–5.6K out.
- The bands worked where one pricey item was the problem: halal stopped buying chicken thighs and beef. They didn't help the $6 deck, where every item was cheap but each dish bought 3 to 6 of them. The model knows which groups are cheap, not how many it can afford.
- One deck per profile is too few to be sure. These are signals, not results.

## Run 2 — 2026-11-04

**Config:** as Run 1, plus photo style `plate-v1` (`photoPrompt`), the new food-only `image_prompt` rule, and `/api/image` taking `{ name, prompt }`. Worker version `229a6330`.

**Review page:** https://claude.ai/artifact/VrFtyqkCkEDbNZntEpF1Go

**Blocked first.** At 15:25 UTC on 2026-11-03 Workers AI refused every photo with `4006: you have used up your daily free allocation of 10,000 neurons`. Retries at 02:22 and 04:12 UTC on 2026-11-04 got the same error, while the dashboard (AI → Workers AI) showed **0/10k neurons used today**. Photos worked again at 15:45 UTC on 2026-11-04, about 24 hours after the block. So the free allowance seems to come back 24 hours after it runs out, not at 00:00 UTC as documented, and the dashboard figure can't be trusted to show it.

**Neurons:** Run 1's ~62 photos used the whole 10K, so each 1024×1024 photo at 4 steps costs **at least ~160 neurons**, not the ~58 the pricing page suggests. The free tier covers about **10 decks of photos a day**. On Workers Paid that's about $0.0018 a photo, ~$0.011 a deck (SPEC §11 budgets ~$0.02).

### Part 1: the same 30 dishes, re-photographed

Run 1 decks 1, 5, 6, 9 and 10, each dish sent with its Run 1 `name` and `image_prompt`. Those prompts still carry "kitchen light" and similar, so this tests the style against the worst inputs.

| | Run 1 | Plate style |
|---|---|---|
| Median size | 544 KB | **337 KB (−38%)** |
| Largest | 870 KB | 484 KB |
| Mean change per dish | | −35% |

All 1024×1024. Median photo time 1.4 s, max 6.1 s.

### Part 2: three new decks under the food-only rule

| Profile | Time | Cards | Dropped | Over budget | Median photo |
|---|---|---|---|---|---|
| Diabetes, brown rice + chickpeas, $14 | 11.6 s | 6 | 0 | 3 | 232 KB |
| Blood pressure, instant noodles, $5 | 8.8 s | 6 | 0 | 2 | 348 KB |
| Anemia, no cilantro, air fryer, $18 | 15.9 s | 6 | 0 | 1 | 356 KB |

- **Validation failure rate: 0%** (0 of 18). No regenerations, no 429s.
- **Tokens:** ~1.5K in, 3.8–7.2K out (2.6–5.7K reasoning). The anemia deck's 8.8K total is over the free tier's 8K a minute on its own; it went through, but two such decks inside a minute would hit a 429.
- **`image_prompt` quality: fixed.** Every prompt describes the food with plain ingredients ("flaked canned tuna and orange carrot pieces tossed with brown rice and chickpeas in a bowl"); none copies the rule, none is generic.
- **Budget:** "Chicken Thigh & Carrot Pilaf" came to ~$34.40 on a $14 budget. The model still ignores tight budgets on some cards.

### What the photos look like

Fixed:
- No kitchens, appliances, fruit bowls or cats. One plate from above on a plain background, every time.
- The dish is always named, so even Run 1's generic diabetes prompts now give plausible photos of the named dish.
- "Instant Noodles with Tuna & Egg" no longer shows sliced meat.

Not fixed:
- **Plate size isn't constant.** From a small plate in lots of space (black bean chili, a sliver of frittata) to nearly filling the frame (roast chicken thighs). Small portions on a big plate look stingy.
- **Stray items:** a fork and orange slices beside the breakfast tacos (the model listed "orange wedges on the side"). Leafy herbs on many dishes, including tacos and enchiladas for the "no cilantro" user.
- **Wrong food:** the sardines in "Microwave Sardine Noodle Bowl" look like mussels.
- **Background tint** drifts between cool blue-grey and warm grey.
- **Size:** 337 KB median is still about 2 MB a deck. Over the ~300 KB line set before this run, so a 512 px WebP resize is now in BACKLOG.

---

## Run 1 — 2026-11-03

**Config:** Groq `openai/gpt-oss-120b` (`openai-compatible`), Workers AI `@cf/black-forest-labs/flux-1-schnell`, 4 steps, no photo style (the model's `image_prompt` sent as is). Worker version `753941d4`.

**Review page:** https://claude.ai/artifact/Aev8jfM54K1oQWrwnQKvtC

### Decks

| # | Profile | Time | Cards | Dropped | Over budget | Median photo |
|---|---|---|---|---|---|---|
| 1 | Student, rice + corn, $15 | 11.7 s | 6 | 0 | 0 | 507 KB |
| 2 | Vegetarian, oats + lentils, $10 | 8.5 s | 6 | 0 | 1 | 523 KB |
| 3 | Cut, eggs + spinach, $12 | 12.7 s | 6 | 0 | 3 | 563 KB |
| 4 | Bulk, pasta + ground beef, $20 | 11.7 s | 6 | 0 | 0 | 581 KB |
| 5 | Diabetes, brown rice + chickpeas, $14 | 11.1 s | 6 | 0 | 0 | 570 KB |
| 6 | Halal, potatoes + onion, $8 | 8.5 s | 6 | 0 | 5 | 498 KB |
| 7 | No dairy + gluten, microwave + kettle, $6 | 10.1 s | 6 | 0 | 2 | 590 KB |
| 8 | Family of 3, $25 | 10.9 s | 6 | 0 | 0 | 573 KB |
| 9 | Blood pressure, instant noodles, $5 | 10.0 s | 6 | 0 | 3 | 528 KB |
| 10 | Anemia, no cilantro, air fryer, $18 | 16.9 s | 6 | 0 | 0 | 598 KB |

- **Validation failure rate: 0%** (0 of 54 cards checked; deck 1's line was missed by the log tail, but it also dealt 6 with none dropped). No regenerations.
- **Cards dropped: 0** of 60.
- **Time per deck:** median 11.0 s, range 8.5–16.9 s. One model call per deck.
- **Tokens per deck:** ~1.3–1.5K in, 3.6–5.8K out, of which 1.8–4.3K reasoning. One deck takes most of a minute's 8K free allowance; the daily 200K allows roughly 30–35 decks.
- **429s or server failures:** none.
- **Worker CPU per deal:** 17–102 ms. Over the Workers Free 10 ms limit; nothing failed, but plan for Workers Paid.
- **Over budget:** deck 6 (halal, $8) had 5 of 6 cards over, by up to ~$17.92. Shown, never hidden, but the model isn't keeping to a tight budget there.

### Photos

- 60 of 60 generated. Always **1024×1024** JPEG: flux-1-schnell takes only `prompt` and `steps`, so the size can't be set.
- **Time:** median 1.7 s, max 7.3 s. The first call after a deploy took 90 s (cold start).
- **Size:** median 550 KB, max 870 KB. About 4–5 MB of mobile data per deck.
- **Cost:** estimated at ~58 neurons each from the pricing page. *Corrected in Run 2:* the run used the whole 10K free daily allowance, so each photo costs at least ~160 neurons.

What they look like:

- Mostly right: everyday plates, home portions. A few rustic shots (roast chicken on dark wood) look pricier than the meal.
- **Busy surroundings:** kitchens, appliances, fruit, a cat on the counter (deck 5), cutlery in many.
- **Deck 5:** the model gave all six cards the same image prompt ("home cooking on a normal plate, realistic portion, kitchen light, cheap dinner") with no dish named, so the photos don't match the dishes.
- **Wrong protein:** "Instant Noodles with Tuna & Egg" shows sliced meat that reads as pork or chicken. Matters for halal and no-pork users.
- **Uninvited garnish:** herbs nobody listed; a "no cilantro" user can see cilantro in a photo of a clean recipe.
- Many image prompts copy the prompt rule word for word ("home cooking on a normal plate, realistic portion, kitchen light…").

### Changed because of this run

- Photo style fixed on the server (`photoPrompt`, style `plate-v1`): one plain white plate or shallow bowl, seen from above, the same size every time, a wide margin, a plain light-grey background, nothing else in frame, no unlisted garnish.
- `POST /api/image` takes the card's `name` as well as its `image_prompt`, so the dish is always named.
- The engine's `image_prompt` rule asks for the visible food only, ingredients named plainly, no setting or lighting.
