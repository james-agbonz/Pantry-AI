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
 * Where a price came from.
 * placeholder — invented, for building and testing. Never called typical.
 * statcan     — Statistics Canada table 18-10-0245-01, a national "typical price".
 * manual      — entered by hand from a store, with its source recorded in tools/prices.
 * store       — from a store's own adapter (later: official APIs, feeds or licensed data).
 */
export const PriceSource = z.enum(["placeholder", "statcan", "manual", "store"]);
export type PriceSource = z.infer<typeof PriceSource>;

/**
 * Where a price applies. `average` is a national typical price (StatCan, and
 * placeholders); `store` is one real store.
 */
export const Store = z.strictObject({
  id: Id,
  name: z.string().min(1),
  kind: z.enum(["average", "store"]),
  region: z.string().min(1).optional(),
});
export type Store = z.infer<typeof Store>;

/** One item at its minimum sellable unit (SPEC §6). Items can change monthly; prices are separate. */
export const Item = z.strictObject({
  id: Id,
  family: Id,
  group: Id,
  name: z.string().min(1),
  unit: z.string().min(1),
  /** Present on meat items only. True means halal-certified. */
  halal: z.boolean().optional(),
});
export type Item = z.infer<typeof Item>;

/** A time-limited discount: `price` applies up to and including `ends`, then the regular price again. */
export const Sale = z.strictObject({
  price: z.number().positive(),
  ends: z.iso.date(),
});
export type Sale = z.infer<typeof Sale>;

/** One item's price at one store, for its whole unit, in CAD. */
export const Price = z
  .strictObject({
    item: Id,
    store: Id,
    regular: z.number().positive(),
    sale: Sale.nullable(),
    source: PriceSource,
    /** ISO date (YYYY-MM-DD) the price was set; null for placeholders. */
    updated: z.iso.date().nullable(),
  })
  .refine((p) => (p.source === "placeholder") === (p.updated === null), {
    message: "a real price needs its date; a placeholder has none",
    path: ["updated"],
  })
  .refine((p) => p.sale === null || p.sale.price < p.regular, { message: "a sale price must be below the regular price", path: ["sale", "price"] })
  .refine((p) => p.source !== "placeholder" || p.sale === null, { message: "a placeholder can't be on sale", path: ["sale"] });
export type Price = z.infer<typeof Price>;

/**
 * The monthly data (schema 2): stores, items and their prices, versioned by
 * publish date ("2026-09-25"). Groups never change; this does. The app
 * fetches the current table from the backend and caches it, with the bundled
 * copy as a fallback (SPEC §16), so a refresh never needs a release.
 */
export const PriceTable = z.strictObject({
  schema: z.literal(2),
  /** The day this table was published, YYYY-MM-DD. Later dates are newer; they compare as text. */
  version: z.iso.date({ error: "version is the publish date, YYYY-MM-DD" }),
  stores: z.array(Store).min(1),
  items: z.array(Item),
  prices: z.array(Price),
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
    dupes(data.table.stores.map((st) => st.id), "table.stores");

    const families = new Set(v.families.map((f) => f.id));
    const familyOf = new Map(v.groups.map((g) => [g.id, g.family]));
    v.groups.forEach((g, i) => {
      if (!families.has(g.family)) issue(`unknown family '${g.family}'`, ["groups", i, "family"]);
      if (g.flavour && FLAVOUR_FAMILIES.includes(g.family)) issue(`'${g.id}' is flavour by family already`, ["groups", i, "flavour"]);
    });

    const stocked = new Set<string>();
    v.items.forEach((item, i) => {
      const family = familyOf.get(item.group);
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

    // Prices: each names a known item and store, once per pair, and every item has at least one.
    const items = new Set(v.items.map((i) => i.id));
    const stores = new Set(data.table.stores.map((st) => st.id));
    const pairs = new Set<string>();
    const priced = new Set<string>();
    data.table.prices.forEach((p, i) => {
      if (!items.has(p.item)) issue(`price for unknown item '${p.item}'`, ["table", "prices", i, "item"]);
      if (!stores.has(p.store)) issue(`price at unknown store '${p.store}'`, ["table", "prices", i, "store"]);
      const pair = `${p.item}@${p.store}`;
      if (pairs.has(pair)) issue(`two prices for '${p.item}' at '${p.store}'`, ["table", "prices", i]);
      pairs.add(pair);
      priced.add(p.item);
    });
    // Pricing never silently leaves an item out: a missing price stops the load and names the item.
    v.items.forEach((item, i) => {
      if (!priced.has(item.id)) issue(`item '${item.id}' has no price`, ["table", "items", i]);
    });
  });
export type VocabularyData = z.infer<typeof VocabularyData>;
