import { RecordedLlm, type LlmClient } from "@pantry/engine";
import type { LlmConfig } from "../config";
import { createAnthropicLlm, type MessagesApi } from "./anthropic";
import sampleDeck from "./sample-deck.json";

export * from "./anthropic";

/**
 * Picks the model adapter from config. `mock` serves a hand-written sample
 * deck forever, offline; it suits `rice` + `corn` with stove, microwave and
 * fridge, and other inputs will see cards fail validation and be dropped.
 */
export function createLlm(
  config: LlmConfig,
  deps: { messages?: MessagesApi; log?: (event: Record<string, unknown>) => void; logReplies?: boolean } = {},
): LlmClient {
  switch (config.provider) {
    case "mock":
      return new RecordedLlm([JSON.stringify(sampleDeck)], { model: config.model, loop: true });
    case "anthropic":
      return createAnthropicLlm({ model: config.model, apiKey: config.apiKey, ...deps });
  }
}
