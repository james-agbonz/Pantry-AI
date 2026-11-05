/**
 * Project Hammer (projecthammer.org): a public dataset of daily grocery
 * prices from Toronto-area store websites, published by its maintainer as a
 * zip of two CSVs. We download the published file; we never visit the
 * stores. Off by default: add `hammer` to PRICE_SOURCES only once the
 * maintainer has agreed to this use (docs/PRICE-SOURCES.md). Prices are for
 * one Toronto neighbourhood, so these stores apply in Ontario.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Price } from "@pantry/vocabulary";
import { parseCsv } from "../csv";
import type { StoreMapEntry } from "../stores";
import { userAgent } from "../web";
import type { PriceSourceAdapter } from "./adapter";
import { SALE_TRUST_DAYS } from "./store";

export const HAMMER_URL = "https://jacobfilipp.com/hammerdata/hammer-5-csv.zip";

/** Our store ids for the Hammer vendors we use, and Hammer's name for each. */
export const HAMMER_STORES = {
  hammer_nofrills_toronto: "NoFrills",
  hammer_walmart_toronto: "Walmart",
} as const;
export type HammerStore = keyof typeof HAMMER_STORES;

/** A price older than this is left out: the product may be gone. */
export const HAMMER_MAX_AGE_DAYS = 14;

export interface HammerPoint {
  date: string;
  price: number;
  /** The struck-out price while on sale. */
  old: number | null;
  other: string;
}

export interface HammerProduct {
  /** Hammer's price-row key: vendor and SKU, e.g. `NoFrills20654832`. */
  ref: string;
  vendor: string;
  name: string;
  units: string;
  brand: string;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const money = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** One CSV line; the fast path when it has no quotes. */
const fields = (line: string) => (line.includes('"') ? (parseCsv(line)[0] ?? []) : line.split(","));

/** Lines of one file inside the zip, streamed (the price file is ~4 GB). Uses the system `unzip`. */
async function* zipLines(zip: string, match: RegExp): AsyncGenerator<string> {
  const names = await new Promise<string[]>((resolve, reject) => {
    let out = "";
    const p = spawn("unzip", ["-Z1", zip]);
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out.split("\n").filter(Boolean)) : reject(new Error(`unzip -Z1 failed (${code})`))));
  });
  const name = names.find((n) => match.test(n));
  if (!name) throw new Error(`no file matching ${match} in ${zip} (has: ${names.join(", ")})`);
  const p = spawn("unzip", ["-p", zip, name]);
  let first = true;
  for await (const line of createInterface({ input: p.stdout, crlfDelay: Infinity })) {
    yield first ? line.replace(/^﻿/, "") : line;
    first = false;
  }
}

/** Products of the given vendors, from the product file. Products without a SKU can't be priced and are left out. */
export async function readHammerProducts(zip: string, vendors: ReadonlySet<string>): Promise<HammerProduct[]> {
  const out: HammerProduct[] = [];
  let header: string[] | null = null;
  let buffer = "";
  for await (const line of zipLines(zip, /product\.csv$/)) {
    // Product names can hold quoted line breaks: gather until the quotes balance.
    buffer = buffer ? `${buffer}\n${line}` : line;
    if ((buffer.match(/"/g)?.length ?? 0) % 2 === 1) continue;
    const row = fields(buffer);
    buffer = "";
    if (!header) {
      header = row;
      continue;
    }
    const get = (k: string) => row[header!.indexOf(k)] ?? "";
    if (!vendors.has(get("vendor")) || !get("sku")) continue;
    out.push({ ref: `${get("vendor")}${get("sku")}`, vendor: get("vendor"), name: get("product_name"), units: get("units"), brand: get("brand") });
  }
  return out;
}

/** The latest valid price for each wanted product, from the price file. Rows aren't in date order. */
export async function readHammerLatest(zip: string, wanted: (ref: string) => boolean): Promise<Map<string, HammerPoint>> {
  const latest = new Map<string, HammerPoint>();
  let header = true;
  for await (const line of zipLines(zip, /raw\.csv$/)) {
    if (header) {
      header = false;
      continue;
    }
    const row = fields(line);
    const ref = row[5];
    if (!ref || !wanted(ref)) continue;
    const date = row[0]?.slice(0, 10) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // The dataset has the odd broken date.
    const price = money(row[1]);
    if (!price) continue;
    const known = latest.get(ref);
    if (!known || date > known.date) latest.set(ref, { date, price, old: money(row[2]), other: row[4] ?? "" });
  }
  return latest;
}

/** Price records for one store's mapped items, from the latest points. Stale, out-of-stock or missing ones are reported. */
export function hammerRecords(
  store: HammerStore,
  entries: Readonly<Record<string, StoreMapEntry>>,
  latest: ReadonlyMap<string, HammerPoint>,
  on: string,
): { records: Price[]; missed: { item: string; why: string }[] } {
  const records: Price[] = [];
  const missed: { item: string; why: string }[] = [];
  const oldest = addDays(on, -HAMMER_MAX_AGE_DAYS);
  for (const [item, entry] of Object.entries(entries)) {
    const p = latest.get(entry.ref);
    if (!p) missed.push({ item, why: "not in the dataset" });
    else if (p.date < oldest) missed.push({ item, why: `last seen ${p.date}` });
    else if (/out of stock/i.test(p.other)) missed.push({ item, why: "out of stock" });
    else {
      const onSale = p.old !== null && p.old > p.price;
      records.push({
        item,
        store,
        regular: onSale ? p.old! : p.price,
        sale: onSale ? { price: p.price, ends: addDays(on, SALE_TRUST_DAYS) } : null,
        source: "store",
        updated: p.date,
      });
    }
  }
  return { records, missed };
}

/** Downloads the published zip, unless the copy on disk is less than a day old. */
export async function downloadHammer(path: string, maxAgeMs = 86_400_000): Promise<string> {
  if (existsSync(path) && Date.now() - statSync(path).mtimeMs < maxAgeMs) return path;
  mkdirSync(dirname(path), { recursive: true });
  const res = await fetch(HAMMER_URL, { headers: { "User-Agent": userAgent() } });
  if (!res.ok || !res.body) throw new Error(`Project Hammer download: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(path));
  return path;
}

/** PRICE_SOURCES=hammer: every Hammer store we use, from one download. */
export function hammerSource(map: Readonly<Record<string, Readonly<Record<string, StoreMapEntry>>>>, zipPath: string, log = console.log): PriceSourceAdapter {
  return {
    id: "hammer",
    async load({ on }) {
      const zip = await downloadHammer(zipPath);
      const wanted = new Set(Object.keys(HAMMER_STORES).flatMap((s) => Object.values(map[s] ?? {}).map((e) => e.ref)));
      const latest = await readHammerLatest(zip, (ref) => wanted.has(ref));
      return (Object.keys(HAMMER_STORES) as HammerStore[]).flatMap((store) => {
        const run = hammerRecords(store, map[store] ?? {}, latest, on);
        for (const m of run.missed) log(`  ${store}: no price for ${m.item} (${m.why})`);
        return run.records;
      });
    },
  };
}
