import { Profile, Session } from "@pantry/contract";
import type { LlmClient } from "@pantry/engine";
import type { PriceTable, Vocabulary } from "@pantry/vocabulary";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { dealPricedDeck } from "./deck";
import type { Refusal, Request as LimitRequest, Reservation } from "./limits";

/** What the routes need; the Worker and the Node dev server each supply their own. */
export interface AppDeps {
  llm: LlmClient;
  /** The vocabulary with the current price table. */
  vocabulary: () => Vocabulary;
  /** The current price table, as served to phones. */
  priceTable: () => PriceTable;
  limits: {
    reserve(r: LimitRequest): Promise<Reservation | Refusal>;
    release(r: Reservation): Promise<void>;
  };
  /** One JSON line per event. Anything secret is redacted before it's written. */
  log?: (event: Record<string, unknown>) => void;
  /** Strings that must never appear in a response or a log line (the API key). */
  secrets?: readonly string[];
  /**
   * Web origins allowed to call the API from a browser (CORS), e.g. the Expo
   * web dev page. The phone app needs none; empty means browsers can't call it.
   */
  allowedOrigins?: readonly string[];
}

/** A random ID the phone makes on first launch: UUID-ish, no personal data. */
const DeviceId = z.string().regex(/^[A-Za-z0-9-]{16,64}$/);

const DeckRequest = z.strictObject({
  profile: Profile,
  session: Session,
  /** The phone's local date, YYYY-MM-DD: the day counted, and the day prices are for. */
  local_date: z.iso.date(),
});

export function createApp(deps: AppDeps) {
  const secrets = (deps.secrets ?? []).filter((s) => s.length >= 8);
  const redact = (text: string) => secrets.reduce((t, s) => t.split(s).join("[redacted]"), text);
  const log = (event: Record<string, unknown>) => (deps.log ?? ((e) => console.info(JSON.stringify(e))))(JSON.parse(redact(JSON.stringify(event))));

  const app = new Hono();
  if (deps.allowedOrigins?.length) {
    app.use(
      "/api/*",
      cors({
        origin: [...deps.allowedOrigins],
        allowHeaders: ["Content-Type", "X-Pantry-Device", "If-None-Match"],
        exposeHeaders: ["ETag"],
      }),
    );
  }

  app.get("/api/health", (c) => c.json({ ok: true, prices: deps.priceTable().version }));

  /**
   * The current price table (SPEC §16). Its version is the ETag, so a phone
   * that already has it gets a 304 and nothing else.
   */
  app.get("/api/prices", (c) => {
    const table = deps.priceTable();
    const etag = `"${table.version}"`;
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=3600");
    if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
    return c.json(table);
  });

  /**
   * Deals one deck (SPEC §16): constraint builder → engine and validation →
   * pricing → sort, streamed as one JSON line per stage and then the deck.
   */
  app.post("/api/deck", async (c) => {
    const device = DeviceId.safeParse(c.req.header("X-Pantry-Device"));
    if (!device.success) return c.json({ error: "bad_request", field: "X-Pantry-Device" }, 400);

    let body: z.infer<typeof DeckRequest>;
    try {
      const parsed = DeckRequest.safeParse(await c.req.json());
      if (!parsed.success) return c.json({ error: "bad_request", field: parsed.error.issues[0]?.path.join(".") ?? "" }, 400);
      body = parsed.data;
    } catch {
      return c.json({ error: "bad_request", field: "body" }, 400);
    }

    // Behind Cloudflare the client IP is in CF-Connecting-IP; elsewhere the first X-Forwarded-For hop.
    const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
    const held = await deps.limits.reserve({ device: device.data, ip, localDate: body.local_date });
    if (!held.ok) {
      log({ event: "deck_refused", reason: held.reason });
      return c.json({ error: held.reason }, held.status);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        // Writing to a phone that has gone away must not stop the deal: the
        // model is already being paid for, and the slot stays used.
        let open = true;
        const send = (line: unknown) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
          } catch {
            open = false;
          }
        };
        try {
          const deal = await dealPricedDeck(body.profile, body.session, {
            llm: deps.llm,
            vocabulary: deps.vocabulary(),
            on: body.local_date,
            onStage: (stage) => send({ stage }),
            log: (e) => log({ ...e }),
          });
          if (deal.cards.length === 0) {
            // Every card failed validation: the server's failure, so the slot comes back.
            await deps.limits.release(held);
            log({ event: "deck_failed", reason: "no_cards", released: true });
            send({ error: "no_cards" });
          } else {
            log({ event: "deck_dealt", cards: deal.cards.length, dropped: deal.dropped.length });
            send({ deck: deal.cards, dropped: deal.dropped.length, left: held.left });
          }
        } catch (e) {
          // The model or pricing failed: also the server's failure.
          await deps.limits.release(held);
          log({ event: "deck_failed", reason: "server", released: true, detail: String(e) });
          send({ error: "server" });
        } finally {
          if (open) {
            try {
              controller.close();
            } catch {
              // Already closed by the client going away.
            }
          }
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((e, c) => {
    log({ event: "error", detail: String(e) });
    return c.json({ error: "server" }, 500);
  });
  return app;
}
