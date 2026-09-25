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
