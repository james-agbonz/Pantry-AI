import { z } from "zod";

/** One item priced from a StatCan product (see statcan-map.json). */
export const MapEntry = z.discriminatedUnion("basis", [
  z.strictObject({ product: z.string().min(1), vector: z.number().int().positive(), basis: z.literal("exact") }),
  /** The product's per-kilogram price times `kg`, the item's stated weight. */
  z.strictObject({ product: z.string().min(1), vector: z.number().int().positive(), basis: z.literal("per_kg"), kg: z.number().positive() }),
]);
export type MapEntry = z.infer<typeof MapEntry>;

export const StatcanMap = z.strictObject({
  _about: z.string(),
  table: z.literal("18-10-0245-01"),
  items: z.record(z.string(), MapEntry),
});
export type StatcanMap = z.infer<typeof StatcanMap>;

/** A StatCan series' latest point: value in dollars, period as YYYY-MM-DD. */
export interface SeriesPoint {
  vector: number;
  title: string;
  period: string;
  value: number;
}
