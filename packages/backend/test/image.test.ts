import { describe, expect, it, vi } from "vitest";
import { createImageClient, MockImageClient, photoPrompt, WorkersAiImageClient, type AiBinding } from "../src";

describe("images", () => {
  it("mock returns a placeholder and records the prompt", async () => {
    const client = createImageClient({ provider: "mock" });
    expect(client).toBeInstanceOf(MockImageClient);
    expect(await client.generate("rice bowl")).toEqual({ url: expect.stringMatching(/^https:\/\//) });
    expect((client as MockImageClient).prompts).toEqual(["rice bowl"]);
  });

  const flux = { provider: "workers-ai" as const, model: "@cf/black-forest-labs/flux-1-schnell", steps: 4 };

  it("workers-ai sends the prompt and steps to the configured model and returns a JPEG data URL", async () => {
    const ai: AiBinding = { run: vi.fn(async () => ({ image: "/9j/AAAA" })) };
    const events: Record<string, unknown>[] = [];
    const client = createImageClient(flux, { ai, log: (e) => events.push(e) });
    expect(client).toBeInstanceOf(WorkersAiImageClient);
    expect(await client.generate("rice bowl")).toEqual({ url: "data:image/jpeg;base64,/9j/AAAA" });
    expect(ai.run).toHaveBeenCalledWith("@cf/black-forest-labs/flux-1-schnell", { prompt: "rice bowl", steps: 4 });
    expect(events).toEqual([expect.objectContaining({ event: "image_call", ok: true, bytes: 6, ms: expect.any(Number) })]);
  });

  it("workers-ai returns null when the model fails or sends no image, so the card shows its fallback", async () => {
    const events: Record<string, unknown>[] = [];
    const failing = createImageClient(flux, { ai: { run: async () => { throw new Error("3040: capacity"); } }, log: (e) => events.push(e) });
    expect(await failing.generate("rice bowl")).toBeNull();
    expect(events[0]).toMatchObject({ event: "image_call", ok: false, detail: expect.stringContaining("capacity") });
    expect(await createImageClient(flux, { ai: { run: async () => ({}) } }).generate("rice bowl")).toBeNull();
  });

  it("workers-ai without the AI binding is a config error, not a silent mock", () => {
    expect(() => createImageClient(flux)).toThrow(/AI binding/);
  });

  it("photoPrompt names the dish and fixes the style: one plate, plain background, nothing else in frame", () => {
    const p = photoPrompt(" Instant Noodles with Tuna & Egg ", "flaked canned tuna and a soft egg over instant noodles ");
    expect(p.startsWith("Instant Noodles with Tuna & Egg: flaked canned tuna and a soft egg over instant noodles")).toBe(true);
    expect(p).toMatch(/Every ingredient named here is clearly visible on the plate/);
    expect(p).toMatch(/45-degree angle/);
    expect(p).toMatch(/27 cm across, centred and filling the middle two-thirds of the frame, the same size and position in every photo/);
    expect(p).toMatch(/The plate is the only object, on a plain flat light-grey background/);
    expect(p).toMatch(/One generous serving, heaped .* true to a real home-cooked portion/);
    expect(p).toMatch(/juicy and delicious/);
    expect(p).toMatch(/nothing beside the plate/);
    expect(p).toMatch(/No herbs or leaves unless listed/);
  });

  it("photoPrompt stays within what image models accept for the longest name and dish the API allows", () => {
    expect(photoPrompt("n".repeat(120), "d".repeat(1200)).length).toBeLessThanOrEqual(2048);
  });
});
