import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it } from "vitest";
import { createLlm, currentPriceTable, dealPricedDeck } from "../src";

describe("dealPricedDeck", () => {
  it("runs the four stages in order and returns priced cards in deck order", async () => {
    const stages: string[] = [];
    const deal = await dealPricedDeck(
      { goal: "eat_well", condition: null, limits: ["no_pork"], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: { kcal: 2400, protein: 120 } },
      { have: ["rice", "corn"], have_other: [], budget: 12, avoid: [] },
      { llm: createLlm({ provider: "mock", model: "sample-deck" }), vocabulary, on: "2026-09-25", log: () => {}, onStage: (s) => stages.push(s) },
    );
    expect(stages).toEqual(["reading", "building", "pricing", "sorting"]);
    expect(deal.cards).toHaveLength(6);
    const tiers = deal.cards.map(({ pricing: p }) => (p.over_by > 0 ? 2 : p.to_complete.length ? 1 : 0));
    expect(tiers).toEqual([...tiers].sort());
    const realGroup = (g: string) => vocabulary.itemsFor(g).some((i) => vocabulary.hasRealPrice(i.id));
    for (const { pricing } of deal.cards) {
      expect(pricing.budget).toBe(12);
      const lines = [...pricing.buy, ...pricing.to_complete];
      expect(pricing.placeholder).toBe(lines.some((l) => !realGroup(l.group)));
      expect(pricing.as_of).toBe(pricing.placeholder ? null : "2026-07");
    }
    // Step 7 made some whole cards real (the tuna salad: tuna, mayonnaise, cucumber).
    expect(deal.cards.some((c) => !c.pricing.placeholder)).toBe(true);
  });
});

describe("currentPriceTable", () => {
  it("is a valid, versioned table the vocabulary accepts", () => {
    const t = currentPriceTable();
    expect(t.version).toMatch(/^\d{4}-\d{2}/);
    expect(vocabulary.withTable(t).items).toHaveLength(vocabulary.items.length);
  });
});
