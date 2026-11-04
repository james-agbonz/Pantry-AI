import type { ImageConfig } from "./config";

/**
 * The seam for dish photos (SPEC §11). Adapters are picked from
 * `IMAGE_PROVIDER`. `null` means the image failed: the card shows its plain
 * fallback, never blocks.
 */
export interface ImageClient {
  readonly provider: string;
  generate(prompt: string): Promise<{ url: string } | null>;
}

/** The photo style's id, logged with every photo so runs can be compared. */
export const PHOTO_STYLE = "plate-v4";

/**
 * The prompt sent to the image model (SPEC §11). The style is fixed here so
 * every photo looks the same: one plate, the same size, on a plain
 * background, nothing else in frame, the food generous and appetising but
 * true to the recipe's portion. The dish comes first because the model pays
 * most attention to the start of the prompt, and every named ingredient must
 * show. The card supplies only the food: its
 * name, so the dish is always named, and its `image_prompt`.
 */
export function photoPrompt(name: string, dish: string): string {
  return [
    `${name.trim()}: ${dish.trim()}`,
    "Every ingredient named here is clearly visible on the plate.",
    "Appetising square food photo, camera at a 45-degree angle.",
    "A single round white plate, 27 cm across, centred and filling the middle two-thirds of the frame, the same size and position in every photo.",
    "The plate is the only object, on a plain flat light-grey background.",
    "One generous serving, heaped and piled up so it covers most of the plate, true to a real home-cooked portion.",
    "The food looks fresh, juicy and delicious: golden-brown edges, glossy sauce, steam rising from hot food, vibrant colours.",
    "The food is exactly the listed ingredients, with nothing added on top and nothing beside the plate. No herbs or leaves unless listed.",
    "Soft directional side light.",
  ].join(" ");
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

/** The slice of the Worker's `AI` binding this adapter uses, so tests can pass a fake. */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/**
 * `IMAGE_PROVIDER=workers-ai`: Cloudflare Workers AI through the Worker's
 * `AI` binding, so there is no key to hold. The model (`IMAGE_MODEL`) returns
 * a base64 JPEG at its own size, which the phone scales into the card.
 */
export class WorkersAiImageClient implements ImageClient {
  readonly provider = "workers-ai";

  constructor(
    private readonly ai: AiBinding,
    private readonly opts: { model: string; steps: number; log?: (event: Record<string, unknown>) => void },
  ) {}

  async generate(prompt: string): Promise<{ url: string } | null> {
    const started = Date.now();
    try {
      // flux-1-schnell on Workers AI takes only prompt and steps: a seed is refused (5006).
      const res = (await this.ai.run(this.opts.model, { prompt, steps: this.opts.steps })) as { image?: unknown };
      if (typeof res?.image !== "string" || res.image.length === 0) throw new Error("no image in the reply");
      this.opts.log?.({ event: "image_call", provider: this.provider, model: this.opts.model, ok: true, ms: Date.now() - started, bytes: Math.floor((res.image.length * 3) / 4) });
      return { url: `data:image/jpeg;base64,${res.image}` };
    } catch (e) {
      this.opts.log?.({ event: "image_call", provider: this.provider, model: this.opts.model, ok: false, ms: Date.now() - started, detail: String(e) });
      return null;
    }
  }
}

/** The slice of the Worker's `IMAGES` binding (Cloudflare Images) the resizer uses, so tests can pass a fake. */
export interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(t: { width: number; height: number; fit: "cover" }): {
      output(o: { format: "image/webp"; quality: number }): Promise<{ image(o: { encoding: "base64" }): ReadableStream<Uint8Array> }>;
    };
  };
}

/**
 * Shrinks every photo another client makes to a small WebP before it leaves
 * the server: a 1024 px flux JPEG is ~400–600 KB, and a phone card shows it
 * far smaller. When resizing fails (Cloudflare Images refuses once the
 * month's free transformations are used, error 9422), the original photo is
 * sent instead: a photo never fails because of the resize.
 */
export class ResizingImageClient implements ImageClient {
  readonly provider: string;

  constructor(
    private readonly inner: ImageClient,
    private readonly images: ImagesBinding,
    private readonly opts: { size: number; quality: number; log?: (event: Record<string, unknown>) => void },
  ) {
    this.provider = inner.provider;
  }

  async generate(prompt: string): Promise<{ url: string } | null> {
    const photo = await this.inner.generate(prompt);
    const match = photo && /^data:image\/[a-z]+;base64,(.+)$/.exec(photo.url);
    if (!photo || !match) return photo;
    const started = Date.now();
    try {
      const bytes = Uint8Array.from(atob(match[1]!), (c) => c.charCodeAt(0));
      const result = await this.images
        .input(new Blob([bytes]).stream())
        .transform({ width: this.opts.size, height: this.opts.size, fit: "cover" })
        .output({ format: "image/webp", quality: this.opts.quality });
      const base64 = await new Response(result.image({ encoding: "base64" })).text();
      if (!base64) throw new Error("empty resize");
      this.opts.log?.({ event: "image_resize", ok: true, ms: Date.now() - started, from_bytes: bytes.length, bytes: Math.floor((base64.length * 3) / 4) });
      return { url: `data:image/webp;base64,${base64}` };
    } catch (e) {
      this.opts.log?.({ event: "image_resize", ok: false, ms: Date.now() - started, detail: String(e) });
      return photo;
    }
  }
}

export function createImageClient(
  config: ImageConfig,
  deps: { ai?: AiBinding; images?: ImagesBinding; log?: (event: Record<string, unknown>) => void } = {},
): ImageClient {
  const log = deps.log ? { log: deps.log } : {};
  let client: ImageClient;
  switch (config.provider) {
    case "mock":
      return new MockImageClient();
    case "workers-ai":
      if (!deps.ai) throw new Error("IMAGE_PROVIDER=workers-ai needs the Worker's AI binding; it runs on the Worker only");
      client = new WorkersAiImageClient(deps.ai, { model: config.model, steps: config.steps, ...log });
  }
  if (!config.resize) return client;
  if (!deps.images) throw new Error("IMAGE_RESIZE needs the Worker's IMAGES binding; it runs on the Worker only");
  return new ResizingImageClient(client, deps.images, { ...config.resize, ...log });
}
