import { z } from "zod";

/**
 * Families whose items carry a `halal` flag. Under the halal diet, groups in
 * these families resolve to halal-certified items only.
 */
export const MEAT_FAMILIES: readonly string[] = ["poultry", "beef", "pork", "lamb"];

const Id = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "ids are snake_case");

export const Family = z.strictObject({ id: Id, label: z.string().min(1) });
export type Family = z.infer<typeof Family>;

/** Groups never change: the engine and saved data depend on these ids. */
export const Group = z.strictObject({ id: Id, family: Id, label: z.string().min(1) });
export type Group = z.infer<typeof Group>;

/**
 * placeholder — not a real price yet (or no price at all).
 * statcan     — Statistics Canada table 18-10-0245-01, a "typical price".
 * manual      — filled by hand where StatCan has a gap.
 */
export const PriceSource = z.enum(["placeholder", "statcan", "manual"]);
export type PriceSource = z.infer<typeof PriceSource>;

/** One item at its minimum sellable unit (SPEC §6). Items and prices can change monthly. */
export const Item = z
  .strictObject({
    id: Id,
    family: Id,
    group: Id,
    name: z.string().min(1),
    unit: z.string().min(1),
    /** Present on meat items only. True means halal-certified. */
    halal: z.boolean().optional(),
    /** CAD for the whole unit. */
    price: z.number().positive().nullable(),
    price_source: PriceSource,
    /** ISO date (YYYY-MM-DD) the price was last set. */
    updated: z.iso.date().nullable(),
  })
  .refine((i) => i.price_source === "placeholder" || (i.price !== null && i.updated !== null), {
    message: "a real price needs a value and an updated date",
    path: ["price"],
  });
export type Item = z.infer<typeof Item>;

export const VocabularyData = z
  .strictObject({
    families: z.array(Family),
    groups: z.array(Group),
    items: z.array(Item),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });

    const dupes = (ids: string[], path: string) => {
      const seen = new Set<string>();
      ids.forEach((id, i) => {
        if (seen.has(id)) issue(`duplicate id '${id}'`, [path, i, "id"]);
        seen.add(id);
      });
    };
    dupes(v.families.map((f) => f.id), "families");
    dupes(v.groups.map((g) => g.id), "groups");
    dupes(v.items.map((i) => i.id), "items");

    const families = new Set(v.families.map((f) => f.id));
    const familyOf = new Map(v.groups.map((g) => [g.id, g.family]));
    v.groups.forEach((g, i) => {
      if (!families.has(g.family)) issue(`unknown family '${g.family}'`, ["groups", i, "family"]);
    });

    const stocked = new Set<string>();
    v.items.forEach((item, i) => {
      const family = familyOf.get(item.group);
      if (family === undefined) issue(`unknown group '${item.group}'`, ["items", i, "group"]);
      else if (family !== item.family) issue(`group '${item.group}' is in family '${family}', not '${item.family}'`, ["items", i, "family"]);
      const meat = MEAT_FAMILIES.includes(item.family);
      if (meat && item.halal === undefined) issue(`meat item '${item.id}' needs a halal flag`, ["items", i, "halal"]);
      if (!meat && item.halal !== undefined) issue(`halal flag is for meat items only`, ["items", i, "halal"]);
      if (item.family === "pork" && item.halal) issue(`pork can't be halal`, ["items", i, "halal"]);
      stocked.add(item.group);
    });
    v.groups.forEach((g, i) => {
      if (!stocked.has(g.id)) issue(`group '${g.id}' has no items`, ["groups", i]);
    });
  });
export type VocabularyData = z.infer<typeof VocabularyData>;
