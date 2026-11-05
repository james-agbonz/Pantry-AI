import type { SeriesPoint } from "./map";

const WDS = "https://www150.statcan.gc.ca/t1/wds/rest";

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface WdsReply<T> {
  status: string;
  object: T;
}

/**
 * Latest point and title for each vector, from Statistics Canada's Web Data
 * Service. Throws if the service or any vector fails: a partial import would
 * silently leave items placeholder.
 */
export async function fetchLatest(
  vectors: readonly number[],
  fetchImpl: Fetch = fetch as unknown as Fetch,
  { retries = 3, retryMs = 2000 }: { retries?: number; retryMs?: number } = {},
): Promise<Map<number, SeriesPoint>> {
  // StatCan's service drops the odd connection; try a few times before giving up.
  const post = async <T>(path: string, body: unknown): Promise<WdsReply<T>[]> => {
    let last: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetchImpl(`${WDS}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`StatCan ${path}: HTTP ${res.status}`);
        return (await res.json()) as WdsReply<T>[];
      } catch (e) {
        last = e;
        if (attempt < retries) await new Promise((r) => setTimeout(r, retryMs * attempt));
      }
    }
    throw new Error(`StatCan ${path} failed after ${retries} tries: ${String(last)}`);
  };

  const unique = [...new Set(vectors)];
  const data = await post<{ vectorId: number; vectorDataPoint: { refPer: string; value: number | null }[] }>(
    "getDataFromVectorsAndLatestNPeriods",
    unique.map((vectorId) => ({ vectorId, latestN: 1 })),
  );
  const info = await post<{ vectorId: number; SeriesTitleEn: string }>("getSeriesInfoFromVector", unique.map((vectorId) => ({ vectorId })));

  const titles = new Map<number, string>();
  for (const r of info) {
    if (r.status !== "SUCCESS") throw new Error(`StatCan series info failed: ${JSON.stringify(r).slice(0, 200)}`);
    titles.set(r.object.vectorId, r.object.SeriesTitleEn);
  }
  const out = new Map<number, SeriesPoint>();
  for (const r of data) {
    if (r.status !== "SUCCESS") throw new Error(`StatCan data failed: ${JSON.stringify(r).slice(0, 200)}`);
    const point = r.object.vectorDataPoint[0];
    if (!point || point.value === null) throw new Error(`StatCan vector ${r.object.vectorId} has no latest value`);
    out.set(r.object.vectorId, { vector: r.object.vectorId, title: titles.get(r.object.vectorId) ?? "", period: point.refPer, value: point.value });
  }
  for (const v of unique) if (!out.has(v)) throw new Error(`StatCan returned nothing for vector ${v}`);
  return out;
}

/** StatCan geography members of table 18-10-0245-01 with a province (or territory) to price for. Nunavut has none. */
export const PROVINCE_GEO = {
  NL: { member: 1, name: "Newfoundland and Labrador" },
  PE: { member: 2, name: "Prince Edward Island" },
  NS: { member: 3, name: "Nova Scotia" },
  NB: { member: 4, name: "New Brunswick" },
  QC: { member: 5, name: "Quebec" },
  ON: { member: 6, name: "Ontario" },
  MB: { member: 7, name: "Manitoba" },
  SK: { member: 8, name: "Saskatchewan" },
  AB: { member: 9, name: "Alberta" },
  BC: { member: 10, name: "British Columbia" },
  YT: { member: 12, name: "Whitehorse, Yukon" },
  NT: { member: 13, name: "Yellowknife, Northwest Territories" },
} as const;
export type PricedProvince = keyof typeof PROVINCE_GEO;

/** A provincial reading: `value` is null when StatCan has no figure there this month. */
export interface ProvincePoint {
  vector: number;
  province: PricedProvince;
  period: string;
  value: number | null;
}

/**
 * The same products' latest prices in every province, from each Canada
 * vector's cube coordinate (`<geography>.<product>.0…`). Throws if the
 * service fails; a province with no figure comes back with `value: null`.
 */
export async function fetchProvinces(
  vectors: readonly number[],
  fetchImpl: Fetch = fetch as unknown as Fetch,
): Promise<ProvincePoint[]> {
  const post = async <T>(path: string, body: unknown): Promise<WdsReply<T>[]> => {
    const res = await fetchImpl(`${WDS}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`StatCan ${path}: HTTP ${res.status}`);
    return (await res.json()) as WdsReply<T>[];
  };
  const unique = [...new Set(vectors)];
  const info = await post<{ vectorId: number; productId: number; coordinate: string }>("getSeriesInfoFromVector", unique.map((vectorId) => ({ vectorId })));
  const product = new Map<number, { pid: number; rest: string }>();
  for (const r of info) {
    if (r.status !== "SUCCESS") throw new Error(`StatCan series info failed: ${JSON.stringify(r).slice(0, 200)}`);
    product.set(r.object.vectorId, { pid: r.object.productId, rest: r.object.coordinate.split(".").slice(1).join(".") });
  }
  const asks = unique.flatMap((vector) =>
    (Object.keys(PROVINCE_GEO) as PricedProvince[]).map((province) => ({ vector, province, coordinate: `${PROVINCE_GEO[province].member}.${product.get(vector)!.rest}` })),
  );
  const out: ProvincePoint[] = [];
  for (let i = 0; i < asks.length; i += 100) {
    const chunk = asks.slice(i, i + 100);
    const data = await post<{ coordinate: string; vectorDataPoint: { refPer: string; value: number | null }[] }>(
      "getDataFromCubePidCoordAndLatestNPeriods",
      chunk.map((a) => ({ productId: product.get(a.vector)!.pid, coordinate: a.coordinate, latestN: 1 })),
    );
    chunk.forEach((a, n) => {
      const r = data[n];
      const point = r?.status === "SUCCESS" ? r.object.vectorDataPoint[0] : undefined;
      out.push({ vector: a.vector, province: a.province, period: point?.refPer ?? "", value: point?.value ?? null });
    });
  }
  return out;
}
