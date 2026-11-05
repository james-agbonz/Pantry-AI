/**
 * Problem reports from Settings › Report a problem. A report is what the user
 * typed plus the app version, the phone's platform and the anonymous device
 * ID: no name, no email, no profile.
 */
export interface Report {
  /** ISO time the server received it. */
  at: string;
  device: string;
  platform: "ios" | "android" | "web";
  app_version: string;
  message: string;
}

export interface ReportStore {
  save(report: Report): Promise<void>;
}

/** The slice of a Workers KV namespace the store uses, so tests can pass a fake. */
export interface KvNamespace {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Reports in Workers KV, one key each: `report:<time>:<random>`, so a key
 * listing comes back oldest first. KV deletes each one `ttlDays` after it
 * arrives (`PANTRY_REPORT_TTL_DAYS`, default a year), so reports don't pile
 * up forever. Read them with `npm run reports -w @pantry/backend`.
 */
export function kvReportStore(kv: KvNamespace, opts: { ttlDays: number; id?: () => string }): ReportStore {
  const id = opts.id ?? (() => crypto.randomUUID());
  return { save: (r) => kv.put(`report:${r.at}:${id()}`, JSON.stringify(r), { expirationTtl: opts.ttlDays * 86_400 }) };
}

/** In memory: tests and the local dev server, which prints each report too. */
export function memoryReportStore(onSave?: (r: Report) => void): ReportStore & { reports: Report[] } {
  const reports: Report[] = [];
  return {
    reports,
    save: async (r) => {
      reports.push(r);
      onSave?.(r);
    },
  };
}
