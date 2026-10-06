import { defineConfig } from "@playwright/test";
import process from "node:process";

const isCI = Boolean(process.env.CI);
const baseURL = "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  // Keep CI reproducible and local runs bounded instead of using half of every CPU.
  workers: isCI ? 1 : 2,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: "./test-results",
  reporter: [
    [isCI ? "line" : "list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  use: {
    baseURL,
    viewport: { width: 1586, height: 992 },
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @pulse-trade/contracts build && pnpm build && pnpm start --hostname 127.0.0.1 --port 3100",
    // NEXT_PUBLIC values are baked into the build; runtime overrides alone cannot isolate tests.
    env: {
      NEXT_PUBLIC_API_URL: `${baseURL}/api/v1`,
      NEXT_PUBLIC_WS_URL: "ws://localhost:3100/realtime",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    url: `${baseURL}/register`,
    timeout: 120_000,
    // Never silently test a developer's existing server or authenticated session.
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
