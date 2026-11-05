/**
 * Prints the problem reports sent from Settings › Report a problem, oldest
 * first, from the Worker's REPORTS KV namespace.
 *
 *   npm run reports -w @pantry/backend              (staging)
 *   npm run reports -w @pantry/backend -- --env=""  (production, once it has REPORTS)
 */
import { execFileSync } from "node:child_process";

const envArg = process.argv.find((a) => a.startsWith("--env="));
const env = envArg ? envArg.slice("--env=".length) : "staging";
const wrangler = (...args) => execFileSync("npx", ["wrangler", "kv", ...args, "--binding", "REPORTS", "--env", env, "--remote"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const keys = JSON.parse(wrangler("key", "list", "--prefix", "report:")).map((k) => k.name).sort();
if (keys.length === 0) console.log("No reports.");
for (const key of keys) {
  const r = JSON.parse(wrangler("key", "get", key));
  console.log(`${r.at}  ${r.platform} ${r.app_version}  device ${r.device.slice(0, 8)}…\n  ${r.message.replace(/\n/g, "\n  ")}\n`);
}
console.log(`${keys.length} report${keys.length === 1 ? "" : "s"} (${env || "production"}).`);
