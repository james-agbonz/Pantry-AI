import { defineConfig, devices } from "@playwright/test";

/**
 * The app against the real API over HTTP: the Node dev server (the same app
 * as the Worker, mock model, limits in memory) and an Expo web build pointed
 * at it. `npm run e2e:api`. Separate from `npm run e2e`, which runs on mocks.
 */
export default defineConfig({
  testDir: "e2e-api",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: { ...devices["iPhone 13"], browserName: "chromium", baseURL: "http://localhost:8082" },
  webServer: [
    {
      command: "PORT=8787 PANTRY_ALLOWED_ORIGINS=http://localhost:8082 LLM_PROVIDER=mock npm run serve -w @pantry/backend",
      cwd: "../..",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "CI=1 EXPO_PUBLIC_API_URL=http://localhost:8787 npx expo start --web --port 8082 --clear",
      url: "http://localhost:8082",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
