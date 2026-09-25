/**
 * Local dev server: `npm run serve -w @pantry/backend` (port 8787, or PORT).
 * The same app as the Worker, with limits kept in memory. Loads the repo's
 * .env if there is one; with none, the model is the offline mock.
 */
import { serve } from "@hono/node-server";
import { loadConfig } from "./config";
import { Limiter, memoryKV } from "./limits";
import { appFromConfig } from "./runtime";

const config = loadConfig({ PANTRY_ALLOWED_ORIGINS: "http://localhost:8081", ...process.env });
const app = appFromConfig(config, new Limiter(memoryKV(), config.limits));
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Pantry API on http://localhost:${port} (model: ${config.llm.provider} ${config.llm.model})`));
