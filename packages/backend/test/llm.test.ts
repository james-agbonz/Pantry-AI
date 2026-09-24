import { buildConstraints, dealDeck } from "@pantry/engine";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it, vi } from "vitest";
import { createLlm, type MessagesApi } from "../src";

const reply = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [{ type: "text", text }],
  stop_reason,
  usage: { input_tokens: 1, output_tokens: 1 },
});

const fake = (res: unknown) => ({ create: vi.fn().mockResolvedValue(res) }) as unknown as MessagesApi & { create: ReturnType<typeof vi.fn> };
const anthropic = { provider: "anthropic" as const, model: "claude-sonnet-5", apiKey: "sk-test" };

describe("createLlm", () => {
  it("anthropic: sends the configured model, system and user, returns the text", async () => {
    const messages = fake(reply("[]"));
    const llm = createLlm(anthropic, { messages });
    expect(llm).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5" });
    expect(await llm.complete({ system: "sys", user: "hi" })).toBe("[]");
    expect(messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-5", system: "sys", messages: [{ role: "user", content: "hi" }] }),
    );
  });

  it("anthropic: follows the model named in config", async () => {
    const messages = fake(reply("[]"));
    await createLlm({ ...anthropic, model: "claude-haiku-4-5" }, { messages }).complete({ system: "", user: "" });
    expect(messages.create.mock.calls[0]![0].model).toBe("claude-haiku-4-5");
  });

  it("anthropic: throws on a refusal or a cut-off reply, and passes SDK errors through", async () => {
    await expect(createLlm(anthropic, { messages: fake(reply("", "refusal")) }).complete({ system: "", user: "" })).rejects.toThrow(/declined/);
    await expect(createLlm(anthropic, { messages: fake(reply("[", "max_tokens")) }).complete({ system: "", user: "" })).rejects.toThrow(/max_tokens/);
    const failing = { create: vi.fn().mockRejectedValue(new Error("529 overloaded")) } as unknown as MessagesApi;
    await expect(createLlm(anthropic, { messages: failing }).complete({ system: "", user: "" })).rejects.toThrow(/overloaded/);
  });

  it("mock: deals a clean sample deck offline, with stats labelled mock", async () => {
    const { input, diet } = buildConstraints(
      { goal: "eat_well", condition: null, limits: ["no_pork", "nuts"], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: null },
      { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] },
    );
    const deal = await dealDeck(input, diet, { llm: createLlm({ provider: "mock", model: "sample-deck" }), vocabulary, log: () => {} });
    expect(deal.cards).toHaveLength(6);
    expect(deal.stats).toMatchObject({ provider: "mock", model: "sample-deck", failed: 0 });
  });
});
