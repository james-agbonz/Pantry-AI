# Sample model responses

These are the raw replies the engine tests feed through `RecordedLlm`.

**They were written by hand, not captured from the model.** No API key existed when step 3 was built. Each file is shaped to match what the engine prompt asks for (SPEC §5), using real group ids from the vocabulary. Once `PANTRY_LLM_API_KEY` is set, record real replies from `LLM_PROVIDER=anthropic` and replace these files, keeping the same names and the same deliberate faults.

The test input is `have: rice, corn`, limits `no_pork` and `nuts`, appliances `stove, microwave, fridge`.

| File | What it is |
|---|---|
| `clean-deck.json` | Six valid cards |
| `deck-fenced.txt` | The same deck wrapped in a markdown code fence |
| `not-json.txt` | A chatty prose reply with no JSON |
| `deck-three-bad.json` | Six cards with three faults: slot 1 uses `bacon` (pork), slot 3 asks for `quinoa` (no such group), slot 4 needs the `oven` (not allowed) |
| `card-fix-*.json` | Valid single-card regenerations |
| `card-still-bad.json` | A regeneration that fails again: "ground pork" in a step |
