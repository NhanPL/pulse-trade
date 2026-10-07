import { defineConfig } from "@playwright/test";
import process from "node:process";

import uiConfig from "./playwright.config";

const baseURL = "http://127.0.0.1:3110";

export default defineConfig({
  ...uiConfig,
  testDir: "./e2e/full-stack",
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  projects: [{ name: "chromium-full-stack", use: { browserName: "chromium" } }],
  outputDir: "./test-results/full-stack",
  reporter: [
    [process.env.CI ? "line" : "list"],
    ["html", { outputFolder: "playwright-report/full-stack", open: "never" }],
  ],
  use: { ...uiConfig.use, baseURL },
  webServer: {
    command:
      "pnpm --filter @pulse-trade/api test:e2e:prepare && pnpm build && pnpm start --hostname 127.0.0.1 --port 3110",
    env: {
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:3111/api/v1",
      NEXT_PUBLIC_WS_URL: "ws://127.0.0.1:3111/realtime",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    url: `${baseURL}/register`,
    timeout: 180_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
