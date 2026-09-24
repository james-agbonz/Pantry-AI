import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest covers pure helpers only; screens are checked in Expo web.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["test/**/*.test.ts"] },
});
