import { vocabulary } from "@pantry/vocabulary";
import { createApp, type AppDeps } from "./app";
import type { Config } from "./config";
import { createImageClient, type AiBinding } from "./image";
import { createLlm } from "./llm";
import { currentPriceTable } from "./prices";

/**
 * The app as both runtimes run it: config picks the model and image provider;
 * the runtime supplies the limiter and, on the Worker, the AI binding.
 */
export function appFromConfig(config: Config, limits: AppDeps["limits"], bindings: { ai?: AiBinding } = {}) {
  const table = currentPriceTable();
  const priced = vocabulary.withTable(table);
  const log = (e: Record<string, unknown>) => console.info(JSON.stringify(e));
  return createApp({
    llm: createLlm(config.llm, { log, logReplies: config.logReplies }),
    images: createImageClient(config.image, { ...bindings, log }),
    vocabulary: () => priced,
    priceTable: () => table,
    limits,
    secrets: config.llm.provider === "mock" ? [] : [config.llm.apiKey],
    allowedOrigins: config.allowedOrigins,
  });
}
