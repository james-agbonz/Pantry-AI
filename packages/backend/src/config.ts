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
    LLM_PROVIDER: z.enum(["anthropic", "openai-compatible", "mock"]).default("mock"),
    LLM_MODEL: z.string().trim().min(1).optional(),
    /** The API root for `openai-compatible`, e.g. https://api.groq.com/openai/v1. */
    LLM_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    PANTRY_LLM_API_KEY: z.string().trim().min(1).optional(),
    IMAGE_PROVIDER: z.enum(["workers-ai", "mock"]).default("mock"),
    IMAGE_MODEL: z.string().trim().min(1).optional(),
    IMAGE_STEPS: z.coerce.number().int().min(1).max(8).default(4),
    PANTRY_LIMIT_DEVICE_PER_DAY: count(DEFAULT_LIMITS.perDevicePerDay),
    PANTRY_LIMIT_IP_PER_DAY: count(DEFAULT_LIMITS.perIpPerDay),
    PANTRY_LIMIT_IP_PER_MINUTE: count(DEFAULT_LIMITS.perIpPerMinute),
    PANTRY_LIMIT_GLOBAL_PER_DAY: count(DEFAULT_LIMITS.globalPerDay),
    PANTRY_LIMIT_IMAGES_IP_PER_MINUTE: count(DEFAULT_LIMITS.imagesPerIpPerMinute),
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
    if (e.LLM_PROVIDER === "openai-compatible" && !e.LLM_BASE_URL) {
      ctx.addIssue({ code: "custom", path: ["LLM_BASE_URL"], message: "LLM_BASE_URL is required when LLM_PROVIDER=openai-compatible" });
    }
  })
  .superRefine((e, ctx) => {
    if (e.IMAGE_PROVIDER !== "mock" && !e.IMAGE_MODEL) {
      ctx.addIssue({ code: "custom", path: ["IMAGE_MODEL"], message: `IMAGE_MODEL is required when IMAGE_PROVIDER=${e.IMAGE_PROVIDER}` });
    }
  });

export type LlmConfig =
  | { provider: "mock"; model: string }
  | { provider: "anthropic"; model: string; apiKey: string }
  | { provider: "openai-compatible"; model: string; apiKey: string; baseUrl: string };

export type ImageConfig = { provider: "mock" } | { provider: "workers-ai"; model: string; steps: number };

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
      : e.LLM_PROVIDER === "openai-compatible"
        ? { provider: e.LLM_PROVIDER, model: e.LLM_MODEL!, apiKey: e.PANTRY_LLM_API_KEY!, baseUrl: e.LLM_BASE_URL!.replace(/\/$/, "") }
        : { provider: e.LLM_PROVIDER, model: e.LLM_MODEL!, apiKey: e.PANTRY_LLM_API_KEY! };
  const image: ImageConfig = e.IMAGE_PROVIDER === "mock" ? { provider: "mock" } : { provider: e.IMAGE_PROVIDER, model: e.IMAGE_MODEL!, steps: e.IMAGE_STEPS };
  const limits: LimitConfig = {
    perDevicePerDay: e.PANTRY_LIMIT_DEVICE_PER_DAY,
    perIpPerDay: e.PANTRY_LIMIT_IP_PER_DAY,
    perIpPerMinute: e.PANTRY_LIMIT_IP_PER_MINUTE,
    globalPerDay: e.PANTRY_LIMIT_GLOBAL_PER_DAY,
    imagesPerIpPerMinute: e.PANTRY_LIMIT_IMAGES_IP_PER_MINUTE,
  };
  const allowedOrigins = e.PANTRY_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  const logReplies = e.PANTRY_LOG_REPLIES === "1" || e.PANTRY_LOG_REPLIES === "true";
  return { llm, image, limits, allowedOrigins, logReplies };
}
