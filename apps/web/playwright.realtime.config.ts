import { defineConfig } from "@playwright/test";
import fullStackConfig from "./playwright.full-stack.config";

// The same public realtime scenarios can run locally without PostgreSQL/auth fixtures.
export default defineConfig({
  ...fullStackConfig,
  testMatch: "realtime.spec.ts",
  webServer: {
    ...fullStackConfig.webServer,
    command:
      "pnpm --filter @pulse-trade/contracts build && pnpm --filter @pulse-trade/api build && pnpm build && pnpm start --hostname 127.0.0.1 --port 3110",
  },
});
