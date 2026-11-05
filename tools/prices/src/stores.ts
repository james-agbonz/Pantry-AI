import { z } from "zod";
import type { PoliteClient } from "./web";

/** What a store page says about one product today. Dollars. `was` is the regular price while it's on sale. */
export interface Shelf {
  name: string;
  price: number;
  was: number | null;
  inStock: boolean;
}

/** The collector's stores and how each one's product is named in `store-map.json`. */
export const STORES = {
  walmart_ca: { origin: "https://www.walmart.ca", ref: "url" },
  gianttiger_ca: { origin: "https://www.gianttiger.com", ref: "handle" },
} as const;
export type CollectorStore = keyof typeof STORES;

/** One item's product at one store, picked and checked by a person (`npm run prices:pick`). */
export const StoreMapEntry = z.strictObject({
  /** Walmart: the product page path, `/en/ip/<slug>/<id>`. Giant Tiger: the Shopify handle. */
  ref: z.string().min(1),
  /** The product as the store names it, with its size, when it was picked. */
  product: z.string().min(1),
});
export type StoreMapEntry = z.infer<typeof StoreMapEntry>;

/** Store id (from stores.json) → item id → its product there. Collector stores and Project Hammer stores alike. */
export const StoreMap = z.strictObject({
  _about: z.string(),
  stores: z.record(z.string(), z.record(z.string(), StoreMapEntry)),
});
export type StoreMap = z.infer<typeof StoreMap>;

const money = z.number().positive();

/** The `__NEXT_DATA__` JSON Walmart's pages carry. */
function nextData(html: string): unknown {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("no page data (the page may be a check page, not the product)");
  return JSON.parse(m[1]!);
}

const WalmartProduct = z.object({
  props: z.object({
    pageProps: z.object({
      initialData: z.object({
        data: z.object({
          product: z.object({
            name: z.string(),
            availabilityStatus: z.string().optional(),
            priceInfo: z.object({
              currentPrice: z.object({ price: money }),
              wasPrice: z.object({ price: money }).nullable().optional(),
            }),
          }),
        }),
      }),
    }),
  }),
});

/** A Walmart.ca product page. Prices are Walmart's default (no store picked). */
export async function walmartShelf(web: PoliteClient, ref: string): Promise<Shelf> {
  const html = await web.get(`${STORES.walmart_ca.origin}${ref}`);
  const p = WalmartProduct.parse(nextData(html)).props.pageProps.initialData.data.product;
  const was = p.priceInfo.wasPrice?.price ?? null;
  return { name: p.name, price: p.priceInfo.currentPrice.price, was: was && was > p.priceInfo.currentPrice.price ? was : null, inStock: p.availabilityStatus !== "OUT_OF_STOCK" };
}

/** Product cards on a Walmart.ca browse page: candidates for `prices:find`. */
export function walmartBrowseItems(html: string): { name: string; price: number; ref: string }[] {
  const d = nextData(html) as { props?: { pageProps?: { initialData?: { searchResult?: { itemStacks?: { items?: unknown[] }[] } } } } };
  const items = d.props?.pageProps?.initialData?.searchResult?.itemStacks?.flatMap((s) => s.items ?? []) ?? [];
  return items.flatMap((raw) => {
    const it = raw as { name?: unknown; price?: unknown; canonicalUrl?: unknown };
    if (typeof it.name !== "string" || typeof it.price !== "number" || typeof it.canonicalUrl !== "string") return [];
    return [{ name: it.name, price: it.price, ref: it.canonicalUrl.split("?")[0]! }];
  });
}

const ShopifyProduct = z.object({
  title: z.string(),
  available: z.boolean(),
  /** Cents. */
  price: z.number().int().positive(),
  compare_at_price: z.number().int().positive().nullable(),
});

/** A Giant Tiger product, from Shopify's public product data (`/products/<handle>.js`). Online prices. */
export async function giantTigerShelf(web: PoliteClient, ref: string): Promise<Shelf> {
  const p = ShopifyProduct.parse(JSON.parse(await web.get(`${STORES.gianttiger_ca.origin}/products/${ref}.js`)));
  const price = p.price / 100;
  const was = p.compare_at_price && p.compare_at_price > p.price ? p.compare_at_price / 100 : null;
  return { name: p.title, price, was, inStock: p.available };
}

const ShopifySuggest = z.object({
  resources: z.object({ results: z.object({ products: z.array(z.object({ title: z.string(), price: z.string(), handle: z.string(), available: z.boolean() })) }) }),
});

/** Giant Tiger's public product search: candidates for `prices:find`. */
export async function giantTigerSearch(web: PoliteClient, query: string, limit = 6): Promise<{ name: string; price: number; ref: string }[]> {
  const url = `${STORES.gianttiger_ca.origin}/search/suggest.json?q=${encodeURIComponent(query)}&resources%5Btype%5D=product&resources%5Blimit%5D=${limit}`;
  const d = ShopifySuggest.parse(JSON.parse(await web.get(url)));
  return d.resources.results.products.filter((p) => p.available).map((p) => ({ name: p.title, price: Number(p.price), ref: p.handle }));
}

export const SHELF: Record<CollectorStore, (web: PoliteClient, ref: string) => Promise<Shelf>> = {
  walmart_ca: walmartShelf,
  gianttiger_ca: giantTigerShelf,
};
