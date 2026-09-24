import { describe, expect, it } from "vitest";
import { loadConfig } from "../src";

describe("loadConfig", () => {
  it("defaults to the offline mock", () => {
    expect(loadConfig({})).toEqual({ llm: { provider: "mock", model: "sample-deck" }, image: { provider: "mock" } });
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

  it("rejects an unknown provider", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "openai" })).toThrow(/LLM_PROVIDER/);
    expect(() => loadConfig({ IMAGE_PROVIDER: "flux" })).toThrow(/IMAGE_PROVIDER/);
  });
});
