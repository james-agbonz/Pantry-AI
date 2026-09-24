import { validateCard, validateDeck, type Card, type CardError, type EngineInput, type ValidateContext } from "@pantry/contract";
import type { Diet, Vocabulary } from "@pantry/vocabulary";
import type { LlmClient } from "./llm";
import { cardPrompt, deckPrompt, type PromptGroup } from "./prompt";

/** Card validation counts for one deck, labelled by provider and model. */
export interface ValidationStats {
  provider: string;
  model: string;
  /** Card validations run: every slot of the first deck, plus every regeneration. */
  validated: number;
  failed: number;
  /** failed / validated. */
  rate: number;
}

export interface DealOptions {
  llm: LlmClient;
  vocabulary: Pick<Vocabulary, "groupList">;
  /** Tries per slot, counting the deck call. Default 3: the deck, then two regenerations. */
  maxAttempts?: number;
  /** Receives one `card_validation` event per deck. Default: a JSON line on `console.info`. */
  log?: (event: { event: "card_validation" } & ValidationStats) => void;
}

export interface Deal {
  /** Cards that passed validation, in slot order. */
  cards: Card[];
  /** Slots that failed every attempt. Never shipped; the deck is just shorter. */
  dropped: { index: number; errors: CardError[] }[];
  stats: ValidationStats;
}

/**
 * Deals one deck (SPEC §7). The model is asked for the whole deck once; every
 * card is validated; each failing card is regenerated alone, in parallel,
 * until it passes or runs out of attempts. Nothing reaches the caller
 * unchecked. Ids are assigned here, after validation.
 */
export async function dealDeck(input: EngineInput, diet: Diet, opts: DealOptions): Promise<Deal> {
  const { llm, vocabulary, maxAttempts = 3, log = defaultLog } = opts;
  const groups = vocabulary.groupList(diet);
  const promptGroups: PromptGroup[] = groups.map((g) => ({ ...g, label: g.label ?? g.group }));
  const ctx: ValidateContext = { input, groups };

  let validated = input.deck;
  let failed = 0;

  const first = validateDeck(parseReply(await llm.complete(deckPrompt(input, promptGroups))), ctx, input.deck);
  failed += first.failed.length;

  // Slot index → card, so regenerated cards land back in their place.
  const slots = new Map<number, Card>();
  const failedIdx = new Set(first.failed.map((f) => f.index));
  let passed = 0;
  for (let index = 0; index < input.deck; index++) {
    if (!failedIdx.has(index)) slots.set(index, first.cards[passed++]!);
  }
  const keep = [...slots.values()].map((c) => c.name);

  const dropped: Deal["dropped"] = [];
  await Promise.all(
    first.failed.map(async ({ index, errors }) => {
      let last = errors;
      for (let attempt = 2; attempt <= maxAttempts; attempt++) {
        validated++;
        const result = validateCard(parseReply(await llm.complete(cardPrompt(input, promptGroups, last, keep))), ctx);
        if (result.ok) {
          slots.set(index, result.card);
          return;
        }
        failed++;
        last = result.errors;
      }
      dropped.push({ index, errors: last });
    }),
  );

  const cards = [...slots.entries()].sort(([a], [b]) => a - b).map(([, card]) => ({ ...card, id: crypto.randomUUID() }));
  dropped.sort((a, b) => a.index - b.index);

  const stats: ValidationStats = {
    provider: llm.provider,
    model: llm.model,
    validated,
    failed,
    rate: validated ? failed / validated : 0,
  };
  log({ event: "card_validation", ...stats });
  return { cards, dropped, stats };
}

/** Strips a markdown code fence if the model wrapped its JSON in one. Parsing is left to the validator. */
export function parseReply(text: string): string {
  const fenced = /^\s*```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/i.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}

function defaultLog(event: object): void {
  console.info(JSON.stringify(event));
}
