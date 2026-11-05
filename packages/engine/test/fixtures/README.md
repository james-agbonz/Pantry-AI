# Sample model responses

These are the raw replies the engine tests feed through `RecordedLlm`.

**Recorded from the real model** on 2026-11-05: Groq `openai/gpt-oss-120b` through staging, with `PANTRY_LOG_REPLIES=1` and `wrangler tail`. The input was the tests' input: `have: rice, corn`, limits `no_pork` and `nuts`, appliances `stove, microwave, fridge`, targets 2,400 kcal and 140 g protein, `avoid: Corn chowder`. All profiles were made up (staging runs on a free tier).

A real model won't make a chosen mistake on request, so the faults the tests need are of two kinds. Some are **real**, caught as the model made them. Others are **injected** by hand into a real reply, and each one is listed below.

| File | What it is |
|---|---|
| `clean-deck.json` | Real, verbatim. Six valid cards, including chicken (for the halal test) |
| `deck-fenced.txt` | `clean-deck.json` wrapped in a markdown code fence (fence added by hand) |
| `not-json.txt` | Hand-written: a chatty prose reply with no JSON. The model hasn't done this yet |
| `deck-real-faults.json` | Real, verbatim. Slots 2 and 5 mark `green_onion` as `completes`, which the rules forbid |
| `card-fix-salmon.json`, `card-fix-sardine.json` | Real, verbatim: the model's own regenerations of those two slots, recorded in the same deal |
| `deck-real-egg.json` | Real, verbatim. Slots 2 and 5 use `egg`, but the group is `eggs` |
| `card-fix-chicken.json` | Real, verbatim: a regeneration from the third deal |
| `deck-three-bad.json` | `clean-deck.json` with three injected faults: slot 1 needs `bacon` (pork), slot 3 needs `quinoa` (no such group), slot 4 needs the `oven` (not allowed) |
| `card-still-bad.json` | Real card (`deck-real-egg.json` slot 1) with an injected step that browns "ground pork" |

Re-record after a model or prompt change: deal the input above on staging, read the `reply` fields from `wrangler tail --env staging --format json`, and replace these files. Keep the names and keep the injected faults.
