/**
 * The Cloudflare Worker (SPEC §16): the same app as the dev server, with the
 * limits in a Durable Object. Deploy with `npm run deploy -w @pantry/backend`;
 * the key is a secret: `wrangler secret put PANTRY_LLM_API_KEY`.
 */
import { DurableObject } from "cloudflare:workers";
import { loadConfig } from "./config";
import { Limiter, type KeyValue, type Request as LimitRequest, type Reservation } from "./limits";
import { appFromConfig } from "./runtime";

export interface Env {
  LIMITER: DurableObjectNamespace<LimiterObject>;
  [name: string]: unknown;
}

/** Plain string settings only: bindings and objects in `env` aren't config. */
const settings = (env: Env) => Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === "string")) as Record<string, string>;

const DAY_MS = 86_400_000;

/**
 * Every deck limit, in one object. A Durable Object handles one call at a
 * time and holds calls while it waits on its own storage, so two deals can
 * never both take the last slot.
 */
export class LimiterObject extends DurableObject<Env> {
  private readonly limiter: Limiter;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const kv: KeyValue = {
      get: (k) => ctx.storage.get(k),
      put: (k, v) => ctx.storage.put(k, v),
      delete: (k) => ctx.storage.delete(k),
      keys: async (prefix) => [...(await ctx.storage.list({ prefix })).keys()],
    };
    this.limiter = new Limiter(kv, loadConfig(settings(env)).limits);
  }

  async reserve(r: LimitRequest) {
    // Old counters are pruned once a day.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
    return this.limiter.reserve(r);
  }

  async release(r: Reservation) {
    await this.limiter.release(r);
  }

  async alarm() {
    await this.limiter.prune();
    await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }
}

export default {
  async fetch(request: globalThis.Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const config = loadConfig(settings(env));
    const limiter = env.LIMITER.get(env.LIMITER.idFromName("global"));
    const app = appFromConfig(config, {
      reserve: (r) => limiter.reserve(r),
      release: (r) => limiter.release(r),
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
