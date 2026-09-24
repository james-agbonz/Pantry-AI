import { z } from "zod";

/**
 * Server config, read from the environment. In dev, `.env` is loaded into
 * `process.env` by `--env-file`; on a host, the platform injects the same
 * variables. Providers and models are chosen here, never in code.
 *
 * The app's key is `PANTRY_LLM_API_KEY`, deliberately not
 * `ANTHROPIC_API_KEY`: Claude Code reads that name, so a distinct one can't
 * be picked up by it (and bill API usage instead of the subscription).
 */
const Env = z
  .object({
    LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
    LLM_MODEL: z.string().trim().min(1).optional(),
    PANTRY_LLM_API_KEY: z.string().trim().min(1).optional(),
    IMAGE_PROVIDER: z.enum(["mock"]).default("mock"),
  })
  .superRefine((e, ctx) => {
    if (e.LLM_PROVIDER === "mock") return;
    for (const key of ["LLM_MODEL", "PANTRY_LLM_API_KEY"] as const) {
      if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when LLM_PROVIDER=${e.LLM_PROVIDER}` });
    }
  });

export type LlmConfig =
  | { provider: "mock"; model: string }
  | { provider: "anthropic"; model: string; apiKey: string };

export interface ImageConfig {
  provider: "mock";
}

export interface Config {
  llm: LlmConfig;
  image: ImageConfig;
}

/** Throws a message naming each bad or missing variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Bad server config:\n${lines.join("\n")}`);
  }
  const e = parsed.data;
  const llm: LlmConfig =
    e.LLM_PROVIDER === "mock"
      ? { provider: "mock", model: e.LLM_MODEL ?? "sample-deck" }
      : { provider: e.LLM_PROVIDER, model: e.LLM_MODEL!, apiKey: e.PANTRY_LLM_API_KEY! };
  return { llm, image: { provider: e.IMAGE_PROVIDER } };
}
