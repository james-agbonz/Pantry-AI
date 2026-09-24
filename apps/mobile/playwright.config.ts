import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests: click through the real app in Expo web, the way the
 * screenshots were taken, so bugs that only show in a running app (like the
 * price-table refetch loop) fail a check instead of waiting for someone to
 * click. Run with `npm run e2e`. First time: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: "http://localhost:8081",
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    // CI=1: no watch mode, no prompts.
    command: "CI=1 npx expo start --web --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
