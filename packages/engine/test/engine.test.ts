import { readFileSync } from "node:fs";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { buildConstraints, dealDeck, parseReply, RecordedLlm, type DealOptions } from "../src";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const { input, diet } = buildConstraints(
  {
    goal: "eat_well",
    condition: null,
    limits: ["no_pork", "nuts"],
    limits_other: [],
    appliances: ["stove", "microwave", "fridge"],
    servings: 1,
    targets: { kcal: 2400, protein: 140 },
  },
  { have: ["rice", "corn"], have_other: [], budget: 15, avoid: ["Corn chowder"] },
);

/** Runs a deal against recorded replies, capturing the log line instead of printing it. */
async function deal(replies: string[], opts: Partial<DealOptions> = {}) {
  const llm = new RecordedLlm(replies, { model: "fixture" });
  const logs: unknown[] = [];
  const result = await dealDeck(input, diet, { llm, vocabulary, log: (e) => logs.push(e), ...opts });
  return { ...result, llm, logs };
}

const names = (cards: { name: string }[]) => cards.map((c) => c.name);
const cleanNames = names(JSON.parse(fixture("clean-deck.json")));

describe("dealDeck", () => {
  it("passes a clean deck with one call", async () => {
    const r = await deal([fixture("clean-deck.json")]);
    expect(r.llm.calls).toHaveLength(1);
    expect(names(r.cards)).toEqual(cleanNames);
    expect(r.dropped).toEqual([]);
  });

  it("assigns a fresh id to every card", async () => {
    const r = await deal([fixture("clean-deck.json")]);
    const ids = r.cards.map((c) => c.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("strips a markdown fence", async () => {
    const r = await deal([fixture("deck-fenced.txt")]);
    expect(names(r.cards)).toEqual(cleanNames);
    expect(parseReply("```\n[]\n```")).toBe("[]");
  });

  it("regenerates only the failing cards, each alone, and keeps slot order", async () => {
    const r = await deal([
      fixture("deck-three-bad.json"),
      fixture("card-fix-tofu.json"),
      fixture("card-fix-chickpea.json"),
      fixture("card-fix-omelette.json"),
    ]);
    expect(r.llm.calls).toHaveLength(4);
    for (const call of r.llm.calls.slice(1)) {
      expect(call.user).toMatch(/Suggest one dish/);
      expect(call.user).toMatch(/rejected for/);
    }
    // Slots 0, 2 and 5 were good and stay where they were.
    expect(r.cards).toHaveLength(6);
    expect([r.cards[0]!.name, r.cards[2]!.name, r.cards[5]!.name]).toEqual([cleanNames[0], cleanNames[2], cleanNames[5]]);
    expect(names(r.cards)).toEqual(expect.arrayContaining(["Crispy tofu with corn rice", "Chickpea and corn curry", "Corn and rice omelette"]));
    expect(names(r.cards)).not.toContain("Bacon and egg fried rice");
  });

  it("tells the retry what went wrong and which dishes to differ from", async () => {
    const bad = JSON.parse(fixture("clean-deck.json"));
    bad[1].missing.push({ group: "bacon", qty: "4 strips", role: "needed" });
    const r = await deal([JSON.stringify(bad), fixture("card-fix-tofu.json")]);
    const retry = r.llm.calls[1]!.user;
    expect(retry).toContain("'bacon' is excluded ('pork')");
    expect(retry).toContain(cleanNames[0]);
    expect(retry).not.toContain(`${cleanNames[1]};`);
  });

  it("retries a card that fails again, then accepts it", async () => {
    const bad = JSON.parse(fixture("clean-deck.json"));
    bad[4].methods = ["oven"];
    const r = await deal([JSON.stringify(bad), fixture("card-still-bad.json"), fixture("card-fix-omelette.json")]);
    expect(r.llm.calls).toHaveLength(3);
    expect(r.llm.calls[2]!.user).toContain("mentions 'ground pork', excluded ('pork')");
    expect(r.cards[4]!.name).toBe("Corn and rice omelette");
    expect(r.dropped).toEqual([]);
  });

  it("drops a card that fails every attempt; it never ships", async () => {
    const bad = JSON.parse(fixture("clean-deck.json"));
    bad[4].methods = ["oven"];
    const r = await deal([JSON.stringify(bad), fixture("card-still-bad.json"), fixture("card-still-bad.json")]);
    expect(r.cards).toHaveLength(5);
    expect(names(r.cards)).not.toContain("Corn rice with ground meat");
    expect(r.dropped).toEqual([{ index: 4, errors: [expect.objectContaining({ code: "excluded_ingredient" })] }]);
  });

  it("honours maxAttempts", async () => {
    const bad = JSON.parse(fixture("clean-deck.json"));
    bad[4].methods = ["oven"];
    const r = await deal([JSON.stringify(bad)], { maxAttempts: 1 });
    expect(r.llm.calls).toHaveLength(1);
    expect(r.dropped.map((d) => d.index)).toEqual([4]);
  });

  it("regenerates all six when the reply is not JSON", async () => {
    const fixes = ["card-fix-tofu.json", "card-fix-chickpea.json", "card-fix-omelette.json"].map(fixture);
    const r = await deal([fixture("not-json.txt"), ...fixes, ...fixes]);
    expect(r.llm.calls).toHaveLength(7);
    expect(r.cards).toHaveLength(6);
    expect(r.dropped).toEqual([]);
  });

  it("works under halal: the clean deck's chicken passes, a ham card doesn't", async () => {
    const halal = buildConstraints(
      { goal: "eat_well", condition: null, limits: ["halal"], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: null },
      { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] },
    );
    const deck = JSON.parse(fixture("clean-deck.json"));
    deck[0].missing = [{ group: "ham", qty: "100g", role: "needed" }];
    const llm = new RecordedLlm([JSON.stringify(deck), fixture("card-fix-tofu.json")]);
    const r = await dealDeck(halal.input, halal.diet, { llm, vocabulary, log: () => {} });
    expect(names(r.cards)).toContain("Chicken thighs with spiced corn rice");
    expect(r.cards[0]!.name).toBe("Crispy tofu with corn rice");
    expect(llm.calls[0]!.user).not.toMatch(/^ham:/m);
  });
});

describe("completes is never seasoning", () => {
  it("the prompt says what completes means and what it never is", async () => {
    const { llm } = await deal([fixture("clean-deck.json")]);
    expect(llm.calls[0]!.user).toMatch(/"completes" is only for protein, vegetables or fibre/);
    expect(llm.calls[0]!.user).toMatch(/Never seasoning, spices, sauces, oil, garlic, lemon, broth/);
  });

  it("a card with cumin as completes is regenerated, and told why", async () => {
    const deck = JSON.parse(fixture("clean-deck.json"));
    deck[3].missing = deck[3].missing.map((m: { group: string; role: string }) => (m.group === "cumin" ? { ...m, role: "completes" } : m));
    const r = await deal([JSON.stringify(deck), fixture("card-fix-omelette.json")]);
    expect(r.llm.calls).toHaveLength(2);
    expect(r.llm.calls[1]!.user).toContain("'cumin' is seasoning or flavour");
    expect(r.cards[3]!.name).toBe("Corn and rice omelette");
  });
});

describe("prompts", () => {
  it("never carry a price", async () => {
    const r = await deal([fixture("deck-three-bad.json"), ...["card-fix-tofu.json", "card-fix-chickpea.json", "card-fix-omelette.json"].map(fixture)]);
    for (const call of r.llm.calls) {
      expect(call.system + call.user).not.toMatch(/\$\s?\d/);
      expect(call.user).toMatch(/Never state a cost/);
    }
  });

  it("carry every exclude term, every allowed method, avoid list and per-dish target", async () => {
    const { llm } = await deal([fixture("clean-deck.json")]);
    const user = llm.calls[0]!.user;
    for (const term of input.exclude) expect(user).toContain(term);
    for (const m of input.methods) expect(user).toContain(m);
    expect(user).toContain("Corn chowder");
    expect(user).toContain("about 800 kcal and 47 g protein");
  });

  it("leave excluded groups out of the group list", async () => {
    const { llm } = await deal([fixture("clean-deck.json")]);
    const list = llm.calls[0]!.user.split("Group list")[1]!;
    expect(list).toMatch(/^white_fish:/m);
    for (const g of ["bacon", "ground_pork", "peanut_butter", "almonds"]) expect(list).not.toMatch(new RegExp(`^${g}:`, "m"));
  });

  it("carry the condition rule", async () => {
    const c = buildConstraints(
      { goal: "condition", condition: "blood_pressure", limits: [], limits_other: [], appliances: ["stove"], servings: 2, targets: null },
      { have: [], have_other: [], budget: 10, avoid: [] },
    );
    const llm = new RecordedLlm([fixture("clean-deck.json")], { loop: true });
    await dealDeck(c.input, c.diet, { llm, vocabulary, log: () => {} });
    expect(llm.calls[0]!.user).toMatch(/low sodium/);
    expect(llm.calls[0]!.user).toMatch(/2 servings/);
  });
});

describe("validation stats", () => {
  it("counts every card validation and logs one line per deck", async () => {
    const r = await deal([fixture("deck-three-bad.json"), fixture("card-still-bad.json"), fixture("card-fix-chickpea.json"), fixture("card-fix-omelette.json"), fixture("card-fix-tofu.json")]);
    // 6 in the deck (3 failed) + 4 regenerations (1 failed).
    expect(r.stats).toEqual({ provider: "mock", model: "fixture", validated: 10, failed: 4, rate: 0.4 });
    expect(r.logs).toEqual([{ event: "card_validation", ...r.stats }]);
  });

  it("reports a zero rate for a clean deck", async () => {
    const r = await deal([fixture("clean-deck.json")]);
    expect(r.stats).toMatchObject({ validated: 6, failed: 0, rate: 0 });
  });
});

describe("RecordedLlm", () => {
  it("throws when called more often than recorded", async () => {
    const llm = new RecordedLlm(["a"]);
    await llm.complete({ system: "", user: "" });
    await expect(llm.complete({ system: "", user: "" })).rejects.toThrow(/only 1 responses recorded/);
  });

  it("loops when asked to", async () => {
    const llm = new RecordedLlm(["a", "b"], { loop: true });
    const out = [];
    for (let i = 0; i < 3; i++) out.push(await llm.complete({ system: "", user: "" }));
    expect(out).toEqual(["a", "b", "a"]);
  });
});
