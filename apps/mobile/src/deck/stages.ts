import type { DealStage } from "@pantry/contract";

/** Loading's four steps, one per pipeline stage (SPEC §2, §16). */
export const STAGES: readonly { stage: DealStage; label: string }[] = [
  { stage: "reading", label: "Reading your ingredients" },
  { stage: "building", label: "Building meals" },
  { stage: "pricing", label: "Checking prices" },
  { stage: "sorting", label: "Sorting" },
];

export type StepState = "done" | "active" | "waiting";

/** A stage is done once reported; the first one not done is the one working now. */
export function stepStates(done: ReadonlySet<DealStage>): StepState[] {
  const firstOpen = STAGES.findIndex((s) => !done.has(s.stage));
  return STAGES.map((s, i) => (done.has(s.stage) ? "done" : i === firstOpen ? "active" : "waiting"));
}
