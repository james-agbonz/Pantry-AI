import { buildConstraints, dealDeck } from "@pantry/engine";
import { vocabulary } from "@pantry/vocabulary";
import { describe, expect, it, vi } from "vitest";
import { createLlm, type Fetch, type MessagesApi } from "../src";
import sampleDeck from "../src/llm/sample-deck.json";

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

  it("anthropic: logs tokens, time and stop reason per call; the raw reply only when asked", async () => {
    const events: Record<string, unknown>[] = [];
    await createLlm(anthropic, { messages: fake(reply("[]")), log: (e) => events.push(e) }).complete({ system: "", user: "" });
    expect(events).toEqual([
      expect.objectContaining({ event: "llm_call", model: "claude-sonnet-5", input_tokens: 1, output_tokens: 1, stop_reason: "end_turn", ms: expect.any(Number) }),
    ]);
    expect(events[0]).not.toHaveProperty("reply");
    await createLlm(anthropic, { messages: fake(reply("[1]")), log: (e) => events.push(e), logReplies: true }).complete({ system: "", user: "" });
    expect(events[1]).toMatchObject({ reply: "[1]" });
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

  const groq = { provider: "openai-compatible" as const, model: "openai/gpt-oss-120b", apiKey: "gsk-test", baseUrl: "https://api.groq.com/openai/v1" };
  const completion = (content: string, finish_reason = "stop") =>
    Response.json({
      choices: [{ message: { role: "assistant", content }, finish_reason }],
      usage: { prompt_tokens: 3, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 2 } },
    });
  /** A fake fetch that answers each call with the next response in turn. */
  const fetchOf = (...responses: Response[]) => vi.fn<Fetch>(async () => responses.shift()!);

  it("openai-compatible: posts the configured model, system and user to the base URL with the key, returns the text", async () => {
    const fetch = fetchOf(completion("[]"));
    const llm = createLlm(groq, { fetch });
    expect(llm).toMatchObject({ provider: "openai-compatible", model: "openai/gpt-oss-120b" });
    expect(await llm.complete({ system: "sys", user: "hi" })).toBe("[]");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer gsk-test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
    });
    expect(JSON.parse(init.body as string)).not.toHaveProperty("response_format");
  });

  it("openai-compatible: logs tokens, reasoning tokens, time and finish reason; the raw reply only when asked", async () => {
    const events: Record<string, unknown>[] = [];
    await createLlm(groq, { fetch: fetchOf(completion("[]")), log: (e) => events.push(e) }).complete({ system: "", user: "" });
    expect(events).toEqual([
      expect.objectContaining({ event: "llm_call", provider: "openai-compatible", model: "openai/gpt-oss-120b", input_tokens: 3, output_tokens: 5, reasoning_tokens: 2, stop_reason: "stop", retried: false, ms: expect.any(Number) }),
    ]);
    expect(events[0]).not.toHaveProperty("reply");
    await createLlm(groq, { fetch: fetchOf(completion("[1]")), log: (e) => events.push(e), logReplies: true }).complete({ system: "", user: "" });
    expect(events[1]).toMatchObject({ reply: "[1]" });
  });

  it("openai-compatible: throws on a cut-off reply or an HTTP error, without the key in the message", async () => {
    await expect(createLlm(groq, { fetch: fetchOf(completion("[", "length")) }).complete({ system: "", user: "" })).rejects.toThrow(/max tokens/);
    const err = await createLlm(groq, { fetch: fetchOf(new Response("bad key gsk-test", { status: 401 })) }).complete({ system: "", user: "" }).catch((e: Error) => e);
    expect(String(err)).toMatch(/HTTP 401/);
    expect(String(err)).not.toContain("gsk-test");
  });

  it("openai-compatible: a 429 waits for retry-after and tries once more; a second 429, or a long wait, fails", async () => {
    const sleep = vi.fn(async () => {});
    const limited = () => new Response("", { status: 429, headers: { "retry-after": "2" } });
    expect(await createLlm(groq, { fetch: fetchOf(limited(), completion("[]")), sleep }).complete({ system: "", user: "" })).toBe("[]");
    expect(sleep).toHaveBeenCalledWith(2000);
    await expect(createLlm(groq, { fetch: fetchOf(limited(), limited()), sleep }).complete({ system: "", user: "" })).rejects.toThrow(/HTTP 429 after one retry/);
    const long = new Response("", { status: 429, headers: { "retry-after": "120" } });
    await expect(createLlm(groq, { fetch: fetchOf(long), sleep }).complete({ system: "", user: "" })).rejects.toThrow(/rate limited/);
  });

  it("openai-compatible: deals a clean deck through the engine", async () => {
    const { input, diet } = buildConstraints(
      { goal: "eat_well", condition: null, limits: ["no_pork", "nuts"], limits_other: [], appliances: ["stove", "microwave", "fridge"], servings: 1, targets: null },
      { have: ["rice", "corn"], have_other: [], budget: 15, avoid: [] },
    );
    const deal = await dealDeck(input, diet, { llm: createLlm(groq, { fetch: fetchOf(completion(JSON.stringify(sampleDeck))) }), vocabulary, log: () => {} });
    expect(deal.cards).toHaveLength(6);
    expect(deal.stats).toMatchObject({ provider: "openai-compatible", model: "openai/gpt-oss-120b", failed: 0 });
  });
});
