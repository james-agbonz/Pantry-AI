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
    `  Items: ${c.items.real} of ${c.items.total} have a real price (${pct(c.items.real, c.items.total)}): ${c.items.statcan} from StatCan, ${c.items.manual} by hand${c.items.store ? `, ${c.items.store} from stores` : ""}; ${c.items.placeholder} placeholder`,
    `  Groups: ${c.groups.real} fully real, ${c.groups.mixed} mixed, ${c.groups.placeholder} with no real price (of ${c.groups.total})`,
    `  Rows to fill before no card says "Sample prices": ${c.placeholderGroups.length}, plus ${halalRows} halal items for halal users`,
    `  Stores: ${v.stores.map((st) => st.name).join(", ")}`,
    `  No real price yet: ${c.placeholderGroups.join(", ") || "none"}`,
  ].join("\n");
}
