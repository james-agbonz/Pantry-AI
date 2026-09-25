import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest } from "@pantry/engine";

/** The slice of the SDK client this adapter uses, so tests can pass a fake. */
export type MessagesApi = Pick<Anthropic["messages"], "create">;

export interface AnthropicOptions {
  model: string;
  apiKey: string;
  /** Defaults to the real SDK client, built with `apiKey` passed explicitly. */
  messages?: MessagesApi;
  /**
   * One `llm_call` line per request: tokens, time and stop reason, which is
   * what a deck costs. With `logReplies`, also the raw reply text (staging:
   * for re-recording the engine's sample responses).
   */
  log?: (event: Record<string, unknown>) => void;
  logReplies?: boolean;
}

/** A six-card deck is a few thousand tokens; this leaves room without risking an HTTP timeout. */
const MAX_TOKENS = 16000;

/** `LLM_PROVIDER=anthropic`. The model comes from `LLM_MODEL`. */
export function createAnthropicLlm(opts: AnthropicOptions): LlmClient {
  // The key is always passed in, so the SDK never falls back to ANTHROPIC_API_KEY.
  const messages = opts.messages ?? new Anthropic({ apiKey: opts.apiKey }).messages;
  return {
    provider: "anthropic",
    model: opts.model,
    async complete(req: LlmRequest): Promise<string> {
      const started = Date.now();
      const res = await messages.create({
        model: opts.model,
        max_tokens: MAX_TOKENS,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      opts.log?.({
        event: "llm_call",
        provider: "anthropic",
        model: opts.model,
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        cache_read_tokens: res.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: res.usage.cache_creation_input_tokens ?? 0,
        ms: Date.now() - started,
        stop_reason: res.stop_reason,
        ...(opts.logReplies ? { reply: text } : {}),
      });
      if (res.stop_reason === "refusal") throw new Error(`${opts.model} declined the request`);
      if (res.stop_reason === "max_tokens") throw new Error(`${opts.model} hit max_tokens before finishing`);
      return text;
    },
  };
}
