import type { ImageConfig } from "./config";

/**
 * The seam for dish photos (SPEC §11). Adapters are picked from
 * `IMAGE_PROVIDER`; only `mock` exists until a real provider is wired in.
 * `null` means the image failed: the card shows its plain fallback, never blocks.
 */
export interface ImageClient {
  readonly provider: string;
  generate(prompt: string): Promise<{ url: string } | null>;
}

/** A fixed placeholder, so screens can be built before any image key exists. */
export class MockImageClient implements ImageClient {
  readonly provider = "mock";
  /** Every prompt received, in order. */
  readonly prompts: string[] = [];

  async generate(prompt: string): Promise<{ url: string }> {
    this.prompts.push(prompt);
    return { url: "https://placehold.co/600x400?text=Pantry" };
  }
}

export function createImageClient(config: ImageConfig): ImageClient {
  switch (config.provider) {
    case "mock":
      return new MockImageClient();
  }
}
