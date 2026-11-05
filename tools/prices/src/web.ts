/**
 * The store collector's web client: it says who it is, reads robots.txt and
 * keeps out of what it disallows, waits between requests to one site, and
 * stops at the first refusal. It never disguises itself or works around
 * blocking (docs/PRICE-SOURCES.md).
 */

/** Who the collector is. `PRICE_BOT_CONTACT` (a URL or email you choose) is added when set. */
export function userAgent(contact = process.env.PRICE_BOT_CONTACT): string {
  return contact ? `PantryPriceBot/0.1 (+${contact})` : "PantryPriceBot/0.1";
}

export type Fetch = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; headers?: { get(name: string): string | null }; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;

/** The site said no (403, 429, a robots.txt rule): stop asking it this run. */
export class Refused extends Error {
  constructor(
    readonly url: string,
    readonly why: string,
  ) {
    super(`${new URL(url).host} refused ${url}: ${why}`);
  }
}

interface Rule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

/** robots.txt rules that apply to us: our own group if the file names us, else `*`. */
export function robotsRules(text: string, agent = "PantryPriceBot"): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, value] = m as unknown as [string, string, string];
    const k = key.toLowerCase();
    if (k === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (k !== "allow" && k !== "disallow")) continue;
    if (k === "disallow" && value === "") continue; // "Disallow:" with nothing means allow all.
    const body = value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    current.rules.push({ allow: k === "allow", pattern: new RegExp(`^${body}`), length: value.length });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  return (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
}

/** The longest matching rule wins; allow wins a tie; no match means allowed. */
export function allowed(rules: readonly Rule[], pathAndQuery: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!r.pattern.test(pathAndQuery)) continue;
    if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

/** A polite client for one run: robots.txt per site, a gap between requests, no retries on refusal. */
export function politeClient(opts: { fetch?: Fetch; gapMs?: number; agent?: string; sleep?: (ms: number) => Promise<void> } = {}) {
  const fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as Fetch);
  const gapMs = opts.gapMs ?? Number(process.env.PRICE_BOT_GAP_MS ?? 4000);
  const agent = opts.agent ?? userAgent();
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const robots = new Map<string, Rule[]>();
  const last = new Map<string, number>();
  const refused = new Set<string>();

  const wait = async (host: string) => {
    const since = Date.now() - (last.get(host) ?? 0);
    if (since < gapMs) await sleep(gapMs - since);
    last.set(host, Date.now());
  };

  async function fetchAllowed(url: string) {
    const u = new URL(url);
    if (refused.has(u.host)) throw new Refused(url, "refused earlier this run");
    if (!robots.has(u.host)) {
      await wait(u.host);
      const r = await fetchImpl(`${u.origin}/robots.txt`, { headers: { "User-Agent": agent } });
      robots.set(u.host, r.ok ? robotsRules(await r.text()) : []);
    }
    if (!allowed(robots.get(u.host)!, u.pathname + u.search)) throw new Refused(url, "robots.txt disallows it");
    await wait(u.host);
    let res = await fetchImpl(url, { headers: { "User-Agent": agent, Accept: "text/html,application/json" } });
    if (res.status === 429) {
      // Too fast: wait what the site asks (up to a minute), try once more, then give up on it.
      const asked = Number(res.headers?.get("retry-after") ?? "");
      await sleep(Math.min(60_000, Number.isFinite(asked) && asked > 0 ? asked * 1000 : 30_000));
      last.set(u.host, Date.now());
      res = await fetchImpl(url, { headers: { "User-Agent": agent, Accept: "text/html,application/json" } });
    }
    // 403, 412 (Walmart's bot check) and a second 429 all mean the site wants us gone.
    if (res.status === 403 || res.status === 412 || res.status === 429) {
      refused.add(u.host);
      throw new Refused(url, `HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  }

  /** The page as text. A `.gz` file (a sitemap) is unzipped. */
  async function get(url: string): Promise<string> {
    const res = await fetchAllowed(url);
    if (!url.endsWith(".gz")) return res.text();
    const stream = new Blob([await res.arrayBuffer()]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  return { get, agent };
}

export type PoliteClient = ReturnType<typeof politeClient>;
