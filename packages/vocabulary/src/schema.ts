import { z } from "zod";

/**
 * Families whose items carry a `halal` flag. Under the halal diet, groups in
 * these families resolve to halal-certified items only.
 */
export const MEAT_FAMILIES: readonly string[] = ["poultry", "beef", "pork", "lamb"];

const Id = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "ids are snake_case");

export const Family = z.strictObject({ id: Id, label: z.string().min(1) });
export type Family = z.infer<typeof Family>;

/**
 * Health Canada's priority food allergens, plus gluten. `shellfish` covers
 * crustaceans and molluscs; `wheat` covers wheat and triticale; `gluten`
 * covers wheat, barley, rye, oats and triticale.
 */
export const Allergen = z.enum([
  "peanuts",
  "tree_nuts",
  "sesame",
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "soy",
  "wheat",
  "mustard",
  "sulphites",
  "gluten",
]);
export type Allergen = z.infer<typeof Allergen>;

/**
 * Families that are seasoning or flavour: they make a dish taste right, not
 * make it a complete meal. Their groups can be `needed`, never `completes`.
 */
export const FLAVOUR_FAMILIES: readonly string[] = ["spices", "condiments", "oils", "baking"];

/** Groups never change: the engine and saved data depend on these ids. */
export const Group = z.strictObject({
  id: Id,
  family: Id,
  label: z.string().min(1),
  /**
   * Allergens any item in the group may contain, including typical "may
   * contain" labelling. Set by hand for every group; `[]` means checked and
   * none, not unknown.
   */
  contains: z.array(Allergen).refine((a) => new Set(a).size === a.length, "duplicate allergen"),
  /**
   * Set by hand on flavour groups outside FLAVOUR_FAMILIES (garlic, lemon,
   * broth…). Flavour never `completes` a meal (SPEC §5).
   */
  flavour: z.literal(true).optional(),
});
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

/**
 * The monthly data: every item with its price, versioned by publish date
 * ("2026-09-25"). Groups never change; this does. The
 * app fetches the current table from the backend and caches it, with the
 * bundled copy as a fallback (SPEC §16), so a refresh never needs a release.
 */
export const PriceTable = z.strictObject({
  /** The day this table was published, YYYY-MM-DD. Later dates are newer; they compare as text. */
  version: z.iso.date({ error: "version is the publish date, YYYY-MM-DD" }),
  items: z.array(Item),
});
export type PriceTable = z.infer<typeof PriceTable>;

export const VocabularyData = z
  .strictObject({
    families: z.array(Family),
    groups: z.array(Group),
    table: PriceTable,
  })
  .superRefine((data, ctx) => {
    const v = { families: data.families, groups: data.groups, items: data.table.items };
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
    dupes(v.items.map((i) => i.id), "table.items");

    const families = new Set(v.families.map((f) => f.id));
    const familyOf = new Map(v.groups.map((g) => [g.id, g.family]));
    v.groups.forEach((g, i) => {
      if (!families.has(g.family)) issue(`unknown family '${g.family}'`, ["groups", i, "family"]);
      if (g.flavour && FLAVOUR_FAMILIES.includes(g.family)) issue(`'${g.id}' is flavour by family already`, ["groups", i, "flavour"]);
    });

    const stocked = new Set<string>();
    v.items.forEach((item, i) => {
      const family = familyOf.get(item.group);
      // Pricing never silently leaves an item out: a missing price stops the load and names the item.
      if (item.price === null) issue(`item '${item.id}' has no price`, ["table", "items", i, "price"]);
      if (family === undefined) issue(`unknown group '${item.group}'`, ["table", "items", i, "group"]);
      else if (family !== item.family) issue(`group '${item.group}' is in family '${family}', not '${item.family}'`, ["table", "items", i, "family"]);
      const meat = MEAT_FAMILIES.includes(item.family);
      if (meat && item.halal === undefined) issue(`meat item '${item.id}' needs a halal flag`, ["table", "items", i, "halal"]);
      if (!meat && item.halal !== undefined) issue(`halal flag is for meat items only`, ["table", "items", i, "halal"]);
      if (item.family === "pork" && item.halal) issue(`pork can't be halal`, ["table", "items", i, "halal"]);
      stocked.add(item.group);
    });
    v.groups.forEach((g, i) => {
      if (!stocked.has(g.id)) issue(`group '${g.id}' has no items`, ["groups", i]);
    });
  });
export type VocabularyData = z.infer<typeof VocabularyData>;
