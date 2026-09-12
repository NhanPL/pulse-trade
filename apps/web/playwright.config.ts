import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["register.spec.ts", "login.spec.ts", "auth-bootstrap.spec.ts", "logout.spec.ts"],
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1586, height: 992 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm start --port 3100",
    url: "http://localhost:3100/register",
    reuseExistingServer: false,
  },
});
