import type { Vocabulary } from "@pantry/vocabulary";
import { coverage } from "./build";
import { rankPlaceholders } from "./rank";

export function report(v: Vocabulary, label: string): string {
  const c = coverage(v);
  const ranked = rankPlaceholders(v);
  const halalRows = ranked.filter((r) => r.why.startsWith("Halal")).length;
  const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`;
  return [
    `${label}: price table ${v.version}`,
    `  Items: ${c.items.statcan} StatCan + ${c.items.manual} by hand = ${c.items.statcan + c.items.manual} of ${c.items.total} real (${pct(c.items.statcan + c.items.manual, c.items.total)}); ${c.items.placeholder} placeholder`,
    `  Groups: ${c.groups.real} fully real, ${c.groups.mixed} mixed, ${c.groups.placeholder} with no real price (of ${c.groups.total})`,
    `  Rows to fill before no card says "Sample prices": ${c.placeholderGroups.length}, plus ${halalRows} halal items for halal users`,
    `  No real price yet: ${c.placeholderGroups.join(", ") || "none"}`,
  ].join("\n");
}
