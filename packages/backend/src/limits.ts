/**
 * Server-side deck limits (SPEC §14, §16). The phone counts decks too, but
 * only for display: this is the authority, so nobody can call /api/deck
 * directly and run up the model bill.
 *
 * The rules live here as plain logic over a tiny key-value store, so the same
 * code runs in memory (tests, local dev) and inside a Durable Object in
 * production, where one object serialises every call.
 */

export interface LimitConfig {
  /** Free decks per device per day (SPEC §14). */
  perDevicePerDay: number;
  /**
   * Decks per IP per day. A tripwire, not a real limit: mobile carriers and
   * student residences put many real users behind one IP.
   */
  perIpPerDay: number;
  /** Deck requests per IP per minute: stops scripted hammering. */
  perIpPerMinute: number;
  /** All decks per UTC day: a circuit breaker in front of the Console spending limit. */
  globalPerDay: number;
}

export const DEFAULT_LIMITS: LimitConfig = { perDevicePerDay: 3, perIpPerDay: 200, perIpPerMinute: 5, globalPerDay: 2000 };

export interface KeyValue {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<unknown>;
  /** Every key starting with `prefix`. */
  keys(prefix: string): Promise<string[]>;
}

export interface Request {
  device: string;
  ip: string;
  /** The phone's local date, YYYY-MM-DD. */
  localDate: string;
}

/** A slot held for one deck. Give it back with `release` only when the server fails. */
export interface Reservation {
  ok: true;
  device: string;
  ip: string;
  /** The day counted against: the device's date, which only moves forward. */
  day: string;
  utcDay: string;
  /** Decks left today for this device after this one. */
  left: number;
}

export interface Refusal {
  ok: false;
  status: 400 | 429 | 503;
  reason: "bad_date" | "rate_limit" | "daily_limit" | "busy";
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

export class Limiter {
  constructor(
    private readonly kv: KeyValue,
    private readonly config: LimitConfig = DEFAULT_LIMITS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async count(key: string): Promise<number> {
    const v = await this.kv.get(key);
    return typeof v === "number" ? v : 0;
  }

  private async bump(key: string, by: number) {
    const next = Math.max(0, (await this.count(key)) + by);
    if (next === 0) await this.kv.delete(key);
    else await this.kv.put(key, next);
  }

  /**
   * Holds a slot for one deck, or says why not. Checks, in order: the date is
   * plausible, the IP isn't hammering, the service isn't over its daily cap,
   * the IP tripwire, then the device's own three a day.
   */
  async reserve({ device, ip, localDate }: Request): Promise<Reservation | Refusal> {
    const now = this.now();
    const utcDay = isoDay(now);

    // The phone's date may differ from UTC by its time zone: within a day either way.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || localDate < addDays(utcDay, -1) || localDate > addDays(utcDay, 1)) {
      return { ok: false, status: 400, reason: "bad_date" };
    }
    // A device's date only moves forward, so it can't claim yesterday, today
    // and tomorrow to get three days' decks at once.
    const lastKey = `dev:${device}:last`;
    const last = (await this.kv.get(lastKey)) as string | undefined;
    const day = last && last > localDate ? last : localDate;

    // Every attempt counts toward the burst limit, refused or not.
    const minuteKey = `ip:${ip}:min:${Math.floor(now.getTime() / 60_000)}`;
    await this.bump(minuteKey, 1);
    if ((await this.count(minuteKey)) > this.config.perIpPerMinute) return { ok: false, status: 429, reason: "rate_limit" };

    const globalKey = `global:${utcDay}`;
    if ((await this.count(globalKey)) >= this.config.globalPerDay) return { ok: false, status: 503, reason: "busy" };

    const ipDayKey = `ip:${ip}:day:${utcDay}`;
    if ((await this.count(ipDayKey)) >= this.config.perIpPerDay) return { ok: false, status: 429, reason: "rate_limit" };

    const deviceKey = `dev:${device}:day:${day}`;
    const used = await this.count(deviceKey);
    if (used >= this.config.perDevicePerDay) return { ok: false, status: 429, reason: "daily_limit" };

    await this.kv.put(lastKey, day);
    await this.bump(deviceKey, 1);
    await this.bump(ipDayKey, 1);
    await this.bump(globalKey, 1);
    return { ok: true, device, ip, day, utcDay, left: this.config.perDevicePerDay - used - 1 };
  }

  /**
   * Gives a slot back. Only for a server-side failure (the model errored, or
   * every card was dropped): never because the phone disconnected, since the
   * model cost is spent either way.
   */
  async release(r: Reservation): Promise<void> {
    await this.bump(`dev:${r.device}:day:${r.day}`, -1);
    await this.bump(`ip:${r.ip}:day:${r.utcDay}`, -1);
    await this.bump(`global:${r.utcDay}`, -1);
  }

  /** Deletes counters from before yesterday. Run daily; keeps storage small. */
  async prune(): Promise<number> {
    const cutoff = addDays(isoDay(this.now()), -2);
    const minuteCutoff = Math.floor(this.now().getTime() / 60_000) - 2;
    let removed = 0;
    for (const key of await this.kv.keys("")) {
      const day = /:day:(\d{4}-\d{2}-\d{2})$/.exec(key)?.[1] ?? /^global:(\d{4}-\d{2}-\d{2})$/.exec(key)?.[1];
      const minute = /:min:(\d+)$/.exec(key)?.[1];
      if ((day && day < cutoff) || (minute && Number(minute) < minuteCutoff)) {
        await this.kv.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

/** In-memory store: tests and the local dev server. */
export function memoryKV(): KeyValue & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>();
  return {
    get: async (k) => m.get(k),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => m.delete(k),
    keys: async (prefix) => [...m.keys()].filter((k) => k.startsWith(prefix)),
    dump: () => Object.fromEntries(m),
  };
}
