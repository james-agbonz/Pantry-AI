import { z } from "zod";
import { DEFAULT_LIMITS, type LimitConfig } from "./limits";

/** A whole number from the environment, or the default when unset. */
const count = (fallback: number) => z.coerce.number().int().positive().default(fallback);

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
    PANTRY_LIMIT_DEVICE_PER_DAY: count(DEFAULT_LIMITS.perDevicePerDay),
    PANTRY_LIMIT_IP_PER_DAY: count(DEFAULT_LIMITS.perIpPerDay),
    PANTRY_LIMIT_IP_PER_MINUTE: count(DEFAULT_LIMITS.perIpPerMinute),
    PANTRY_LIMIT_GLOBAL_PER_DAY: count(DEFAULT_LIMITS.globalPerDay),
    /** "1" to log each raw model reply (staging only: for re-recording sample responses). */
    PANTRY_LOG_REPLIES: z.enum(["", "0", "1", "true", "false"]).default(""),
    /** Comma-separated web origins allowed to call the API from a browser. Empty: none. */
    PANTRY_ALLOWED_ORIGINS: z.string().default(""),
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
  limits: LimitConfig;
  allowedOrigins: string[];
  logReplies: boolean;
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
  const limits: LimitConfig = {
    perDevicePerDay: e.PANTRY_LIMIT_DEVICE_PER_DAY,
    perIpPerDay: e.PANTRY_LIMIT_IP_PER_DAY,
    perIpPerMinute: e.PANTRY_LIMIT_IP_PER_MINUTE,
    globalPerDay: e.PANTRY_LIMIT_GLOBAL_PER_DAY,
  };
  const allowedOrigins = e.PANTRY_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  const logReplies = e.PANTRY_LOG_REPLIES === "1" || e.PANTRY_LOG_REPLIES === "true";
  return { llm, image: { provider: e.IMAGE_PROVIDER }, limits, allowedOrigins, logReplies };
}
