import { budgetStatus, type BudgetStatus, type Pricing } from "@pantry/contract";
import { money } from "@/format";

/** One budget badge: a word and a figure, in reading order (DESIGN.md › BudgetBadge). */
export interface Badge {
  status: BudgetStatus;
  parts: { kind: "word" | "figure"; text: string }[];
  /** The whole badge as one phrase, for screen readers. */
  label: string;
}

/**
 * `withTotal: false` drops the figure from the fits badge, for the meal
 * screen where the total is printed right beside it. Over and to-complete
 * keep theirs: those amounts appear nowhere else.
 */
export function badgeFor(p: Pricing, { withTotal = true }: { withTotal?: boolean } = {}): Badge {
  const status = budgetStatus(p);
  const parts: Badge["parts"] =
    status === "over"
      ? [{ kind: "word", text: "Over by" }, { kind: "figure", text: money(p.over_by) }]
      : status === "complete"
        ? [{ kind: "figure", text: `+${money(p.complete_cost)}` }, { kind: "word", text: "to complete" }]
        : withTotal
          ? [{ kind: "word", text: "Fits" }, { kind: "figure", text: money(p.total) }]
          : [{ kind: "word", text: "Fits" }];
  return { status, parts, label: parts.map((x) => x.text).join(" ") };
}
