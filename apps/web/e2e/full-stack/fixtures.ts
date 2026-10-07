import { test as base } from "@playwright/test";

import type { startO04Server } from "../../../api/test/e2e/o04-server.mjs";

type PaperAccount = Awaited<ReturnType<typeof startO04Server>>;

export const test = base.extend<{ paperAccount: PaperAccount }>({
  paperAccount: [
    async ({ browserName }, provideAccount) => {
      if (browserName !== "chromium")
        throw new Error("Full-stack config requires the Chromium project.");
      const { startO04Server } = await import("../../../api/test/e2e/o04-server.mjs");
      const server = await startO04Server();
      try {
        await provideAccount(server);
      } finally {
        // Automatic test fixtures start before browser contexts and close after their teardown.
        // Every scenario owns its account/API, including after a failed browser assertion.
        await server.close();
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
