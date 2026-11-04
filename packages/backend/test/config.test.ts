import { describe, expect, it } from "vitest";
import { loadConfig } from "../src";

describe("loadConfig", () => {
  it("defaults to the offline mock", () => {
    expect(loadConfig({})).toEqual({
      llm: { provider: "mock", model: "sample-deck" },
      image: { provider: "mock" },
      limits: { perDevicePerDay: 3, perIpPerDay: 200, perIpPerMinute: 5, globalPerDay: 2000, imagesPerIpPerMinute: 40 },
      allowedOrigins: [],
      logReplies: false,
    });
    expect(loadConfig({ PANTRY_LOG_REPLIES: "1" }).logReplies).toBe(true);
  });

  it("reads limits from the environment, so they change without a code change", () => {
    expect(loadConfig({ PANTRY_LIMIT_DEVICE_PER_DAY: "5", PANTRY_LIMIT_GLOBAL_PER_DAY: "100" }).limits).toMatchObject({ perDevicePerDay: 5, globalPerDay: 100 });
    expect(() => loadConfig({ PANTRY_LIMIT_IP_PER_DAY: "lots" })).toThrow(/PANTRY_LIMIT_IP_PER_DAY/);
  });

  it("reads the provider, model and key", () => {
    const c = loadConfig({ LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-sonnet-5", PANTRY_LLM_API_KEY: "sk-test" });
    expect(c.llm).toEqual({ provider: "anthropic", model: "claude-sonnet-5", apiKey: "sk-test" });
  });

  it("names each missing variable for a real provider", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "anthropic" })).toThrow(/LLM_MODEL[\s\S]*PANTRY_LLM_API_KEY/);
    expect(() => loadConfig({ LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-sonnet-5" })).toThrow(/PANTRY_LLM_API_KEY is required/);
  });

  it("never reads ANTHROPIC_API_KEY", () => {
    const env = { LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-sonnet-5", ANTHROPIC_API_KEY: "sk-decoy" };
    expect(() => loadConfig(env)).toThrow(/PANTRY_LLM_API_KEY is required/);
    const c = loadConfig({ ...env, PANTRY_LLM_API_KEY: "sk-app" });
    expect(c.llm.provider === "anthropic" && c.llm.apiKey).toBe("sk-app");
  });

  it("reads an OpenAI-compatible provider: base URL, model and key, all required", () => {
    const env = { LLM_PROVIDER: "openai-compatible", LLM_MODEL: "openai/gpt-oss-120b", PANTRY_LLM_API_KEY: "gsk-test", LLM_BASE_URL: "https://api.groq.com/openai/v1/" };
    expect(loadConfig(env).llm).toEqual({ provider: "openai-compatible", model: "openai/gpt-oss-120b", apiKey: "gsk-test", baseUrl: "https://api.groq.com/openai/v1" });
    expect(() => loadConfig({ ...env, LLM_BASE_URL: undefined })).toThrow(/LLM_BASE_URL is required/);
    expect(() => loadConfig({ ...env, LLM_BASE_URL: "not a url" })).toThrow(/LLM_BASE_URL/);
    expect(() => loadConfig({ ...env, PANTRY_LLM_API_KEY: undefined })).toThrow(/PANTRY_LLM_API_KEY is required/);
  });

  it("reads Workers AI photos: model required, steps default 4 and at most 8", () => {
    const env = { IMAGE_PROVIDER: "workers-ai", IMAGE_MODEL: "@cf/black-forest-labs/flux-1-schnell" };
    expect(loadConfig(env).image).toEqual({ provider: "workers-ai", model: "@cf/black-forest-labs/flux-1-schnell", steps: 4 });
    expect(loadConfig({ ...env, IMAGE_STEPS: "6" }).image).toMatchObject({ steps: 6 });
    expect(() => loadConfig({ ...env, IMAGE_STEPS: "9" })).toThrow(/IMAGE_STEPS/);
    expect(() => loadConfig({ IMAGE_PROVIDER: "workers-ai" })).toThrow(/IMAGE_MODEL is required/);
    expect(loadConfig({ PANTRY_LIMIT_IMAGES_IP_PER_MINUTE: "10" }).limits.imagesPerIpPerMinute).toBe(10);
  });

  it("rejects an unknown provider", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "openai" })).toThrow(/LLM_PROVIDER/);
    expect(() => loadConfig({ IMAGE_PROVIDER: "flux" })).toThrow(/IMAGE_PROVIDER/);
  });
});
