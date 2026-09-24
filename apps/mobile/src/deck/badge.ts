import { budgetStatus, type BudgetStatus, type Pricing } from "@pantry/contract";
import { money } from "@/format";

/** One budget badge: a word and a figure, in reading order (DESIGN.md › BudgetBadge). */
export interface Badge {
  status: BudgetStatus;
  parts: { kind: "word" | "figure"; text: string }[];
  /** The whole badge as one phrase, for screen readers. */
  label: string;
}

export function badgeFor(p: Pricing): Badge {
  const status = budgetStatus(p);
  const parts: Badge["parts"] =
    status === "over"
      ? [{ kind: "word", text: "Over by" }, { kind: "figure", text: money(p.over_by) }]
      : status === "complete"
        ? [{ kind: "figure", text: `+${money(p.complete_cost)}` }, { kind: "word", text: "to complete" }]
        : [{ kind: "word", text: "Fits" }, { kind: "figure", text: money(p.total) }];
  return { status, parts, label: parts.map((x) => x.text).join(" ") };
}
