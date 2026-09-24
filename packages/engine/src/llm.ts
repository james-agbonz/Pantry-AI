/** One request to a language model: the engine owns both prompts. */
export interface LlmRequest {
  system: string;
  user: string;
}

/**
 * The seam between the engine and any model provider. Adapters live in the
 * backend and are picked from config (`LLM_PROVIDER`, `LLM_MODEL`), so a
 * provider or model changes without touching the engine. `provider` and
 * `model` label the validation stats each deck logs.
 */
export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  /** Returns the model's raw text reply. */
  complete(req: LlmRequest): Promise<string>;
}

/**
 * Replays recorded responses in order. Throws when asked for more than were
 * recorded, so a test can't pass by silently over-calling the model — unless
 * `loop` is set, which the offline `mock` provider uses to serve forever.
 */
export class RecordedLlm implements LlmClient {
  readonly provider = "mock";
  readonly model: string;
  /** Every request received, in order. */
  readonly calls: LlmRequest[] = [];
  private readonly responses: readonly string[];
  private readonly loop: boolean;

  constructor(responses: readonly string[], opts: { model?: string; loop?: boolean } = {}) {
    if (!responses.length) throw new Error("RecordedLlm needs at least one response");
    this.responses = responses;
    this.model = opts.model ?? "recorded";
    this.loop = opts.loop ?? false;
  }

  async complete(req: LlmRequest): Promise<string> {
    const n = this.calls.length;
    this.calls.push(req);
    if (n >= this.responses.length && !this.loop) {
      throw new Error(`RecordedLlm: call ${n + 1} but only ${this.responses.length} responses recorded`);
    }
    return this.responses[n % this.responses.length]!;
  }
}
