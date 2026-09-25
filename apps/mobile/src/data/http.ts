import { PricedCard, type DealStage, type Profile, type Session } from "@pantry/contract";
import { z } from "zod";
import { DealError, type DeckSource, type DealFailure, type PriceTableSource } from "./sources";

/** The fetch the app uses: `expo/fetch` on the phone (it streams), the global one in tests. */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

const REASONS: readonly DealFailure[] = ["daily_limit", "rate_limit", "busy", "bad_request", "bad_date", "server", "no_cards"];
const asFailure = (x: unknown): DealFailure => (REASONS.includes(x as DealFailure) ? (x as DealFailure) : "server");

const Line = z.union([
  z.object({ stage: z.enum(["reading", "building", "pricing", "sorting"]) }),
  z.object({ deck: z.array(PricedCard), dropped: z.number(), left: z.number() }),
  z.object({ error: z.string() }),
]);

/**
 * Reads `/api/deck`'s stream: one JSON line per stage as it finishes, then
 * the deck or an error. Each line is checked against the contract.
 */
export async function readDeckStream(body: ReadableStream<Uint8Array>, onStage?: (s: DealStage) => void): Promise<{ cards: PricedCard[]; left: number }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (text: string) => {
    if (!text.trim()) return undefined;
    const parsed = Line.safeParse((() => {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    })());
    // A whole line that isn't what the server promised is the server's fault.
    if (!parsed.success) throw new DealError("server");
    const line = parsed.data;
    if ("stage" in line) onStage?.(line.stage);
    else if ("error" in line) throw new DealError(asFailure(line.error));
    else return { cards: line.deck, left: line.left };
    return undefined;
  };
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new DealError("network");
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const result = handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (result) return result;
    }
  }
  // A half line at the end, or no deck at all: the connection dropped mid-way.
  throw new DealError("network");
}

/** `POST /api/deck` (SPEC §16). */
export function httpDeckSource(baseUrl: string, deviceId: () => Promise<string>, today: () => string, fetchImpl: Fetch): DeckSource {
  return {
    async deal(profile: Profile, session: Session, { onStage } = {}) {
      let res: Awaited<ReturnType<Fetch>>;
      try {
        res = await fetchImpl(`${baseUrl}/api/deck`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Pantry-Device": await deviceId() },
          body: JSON.stringify({ profile, session, local_date: today() }),
        });
      } catch {
        throw new DealError("network");
      }
      if (!res.ok) {
        const error = await res.json().then((j) => (j as { error?: unknown }).error, () => undefined);
        throw new DealError(asFailure(error));
      }
      if (!res.body) throw new DealError("network");
      return readDeckStream(res.body, onStage);
    },
  };
}

/** `GET /api/prices`, sending the version we hold so an unchanged table costs a 304. */
export function httpPriceTableSource(baseUrl: string, fetchImpl: Fetch): PriceTableSource {
  return {
    async fetch(knownVersion) {
      const res = await fetchImpl(`${baseUrl}/api/prices`, { headers: knownVersion ? { "If-None-Match": `"${knownVersion}"` } : {} });
      if (res.status === 304) return undefined;
      if (!res.ok) throw new Error(`prices: HTTP ${res.status}`);
      return res.json();
    },
  };
}
