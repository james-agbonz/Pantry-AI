import { describe, expect, it } from "vitest";
import { STAGES, stepStates } from "../src/deck/stages";
import { dealBlocker } from "../src/home/deal";

describe("loading steps", () => {
  it("follow the pipeline in order", () => {
    expect(STAGES.map((s) => s.stage)).toEqual(["reading", "building", "pricing", "sorting"]);
  });

  it("tick only for stages reported done; the next one is active", () => {
    expect(stepStates(new Set())).toEqual(["active", "waiting", "waiting", "waiting"]);
    expect(stepStates(new Set(["reading"]))).toEqual(["done", "active", "waiting", "waiting"]);
    expect(stepStates(new Set(["reading", "building", "pricing", "sorting"]))).toEqual(["done", "done", "done", "done"]);
  });
});

describe("why Deal me meals is disabled", () => {
  it("says what to do, in the order the user can act", () => {
    expect(dealBlocker({ decksLeft: 3, picked: 0, budget: null })).toBe("Tap at least one thing you have");
    expect(dealBlocker({ decksLeft: 3, picked: 2, budget: null })).toBe("Enter a budget");
    expect(dealBlocker({ decksLeft: 0, picked: 2, budget: 15 })).toBe("That's today's decks. More tomorrow.");
    expect(dealBlocker({ decksLeft: 3, picked: 1, budget: 15 })).toBeNull();
  });
});
