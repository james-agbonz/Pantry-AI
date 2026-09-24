import { describe, expect, it } from "vitest";
import { createImageClient, MockImageClient } from "../src";

describe("images", () => {
  it("mock returns a placeholder and records the prompt", async () => {
    const client = createImageClient({ provider: "mock" });
    expect(client).toBeInstanceOf(MockImageClient);
    expect(await client.generate("rice bowl")).toEqual({ url: expect.stringMatching(/^https:\/\//) });
    expect((client as MockImageClient).prompts).toEqual(["rice bowl"]);
  });
});
