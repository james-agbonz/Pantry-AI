import type { LlmClient, LlmRequest } from "@pantry/engine";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAiCompatibleOptions {
  /** The API root, e.g. https://api.groq.com/openai/v1. */
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Defaults to the global `fetch`; tests pass a fake. */
  fetch?: Fetch;
  /** Waits before the one retry on a 429; tests pass an instant one. */
  sleep?: (ms: number) => Promise<void>;
  /** One `llm_call` line per request, in the same shape as the anthropic adapter's. */
  log?: (event: Record<string, unknown>) => void;
  logReplies?: boolean;
}

/** Same ceiling as the anthropic adapter: a deck is a few thousand tokens. */
const MAX_TOKENS = 16000;
/** Longest wait honoured from a 429's `retry-after`; beyond it the deck fails and its slot comes back. */
const MAX_RETRY_WAIT_MS = 30_000;

interface ChatCompletion {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
}

/**
 * `LLM_PROVIDER=openai-compatible`: any provider that speaks the OpenAI chat
 * completions API (Groq, among others). The base URL and model come from
 * `LLM_BASE_URL` and `LLM_MODEL`.
 */
export function createOpenAiCompatibleLlm(opts: OpenAiCompatibleOptions): LlmClient {
  const fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = `${opts.baseUrl}/chat/completions`;

  const post = (req: LlmRequest) =>
    fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      // No response_format: JSON-object mode would refuse the deck's top-level array.
      body: JSON.stringify({
        model: opts.model,
        max_completion_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
    });

  return {
    provider: "openai-compatible",
    model: opts.model,
    async complete(req: LlmRequest): Promise<string> {
      const started = Date.now();
      let res = await post(req);
      let retried = false;
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after") ?? "1") * 1000;
        if (!(wait <= MAX_RETRY_WAIT_MS)) throw new Error(`${opts.model} rate limited (retry-after ${res.headers.get("retry-after")})`);
        await sleep(wait);
        retried = true;
        res = await post(req);
      }
      // The body of an error can echo the request; only the status leaves here.
      if (!res.ok) throw new Error(`${opts.model} request failed: HTTP ${res.status}${retried ? " after one retry" : ""}`);

      const body = (await res.json()) as ChatCompletion;
      const choice = body.choices?.[0];
      const text = choice?.message?.content ?? "";
      opts.log?.({
        event: "llm_call",
        provider: "openai-compatible",
        model: opts.model,
        input_tokens: body.usage?.prompt_tokens ?? 0,
        output_tokens: body.usage?.completion_tokens ?? 0,
        reasoning_tokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        ms: Date.now() - started,
        stop_reason: choice?.finish_reason ?? null,
        retried,
        ...(opts.logReplies ? { reply: text } : {}),
      });
      if (choice?.finish_reason === "length") throw new Error(`${opts.model} hit max tokens before finishing`);
      if (choice?.finish_reason === "content_filter") throw new Error(`${opts.model} declined the request`);
      return text;
    },
  };
}
