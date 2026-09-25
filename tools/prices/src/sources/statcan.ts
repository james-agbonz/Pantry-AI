import type { Price } from "@pantry/vocabulary";
import type { MapEntry, SeriesPoint } from "../map";
import { fetchLatest } from "../statcan";
import type { PriceSourceAdapter } from "./adapter";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** StatCan titles carry stray spaces ("Brown rice, 900 grams "); compare without them. */
const sameTitle = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/** Turns this month's StatCan series into national typical prices for the mapped items. */
export function statcanRecords(map: Record<string, MapEntry>, series: ReadonlyMap<number, SeriesPoint>): Price[] {
  return Object.entries(map).map(([item, entry]) => {
    const point = series.get(entry.vector);
    if (!point) throw new Error(`no StatCan data for '${item}' (vector ${entry.vector})`);
    // The vector must still be this product, nationally; StatCan can reuse or retitle series.
    if (!sameTitle(point.title, `Canada;${entry.product}`)) {
      throw new Error(`vector ${entry.vector} is now '${point.title}', not 'Canada;${entry.product}' (item '${item}')`);
    }
    const regular = entry.basis === "exact" ? point.value : point.value * entry.kg;
    return { item, store: "ca_typical", regular: round2(regular), sale: null, source: "statcan", updated: point.period.slice(0, 10) };
  });
}

export function statcanSource(map: Record<string, MapEntry>, fetchSeries = fetchLatest): PriceSourceAdapter {
  return {
    id: "statcan",
    async load() {
      const series = await fetchSeries(Object.values(map).map((e) => e.vector));
      return statcanRecords(map, series);
    },
  };
}
