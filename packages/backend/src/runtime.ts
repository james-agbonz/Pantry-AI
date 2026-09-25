import { vocabulary } from "@pantry/vocabulary";
import { createApp, type AppDeps } from "./app";
import type { Config } from "./config";
import { createLlm } from "./llm";
import { currentPriceTable } from "./prices";

/** The app as both runtimes run it: config picks the model; the runtime supplies the limiter. */
export function appFromConfig(config: Config, limits: AppDeps["limits"]) {
  const table = currentPriceTable();
  const priced = vocabulary.withTable(table);
  return createApp({
    llm: createLlm(config.llm, { log: (e) => console.info(JSON.stringify(e)), logReplies: config.logReplies }),
    vocabulary: () => priced,
    priceTable: () => table,
    limits,
    secrets: config.llm.provider === "anthropic" ? [config.llm.apiKey] : [],
    allowedOrigins: config.allowedOrigins,
  });
}
