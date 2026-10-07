import { test as base } from "@playwright/test";

import type { startO04Server } from "../../../api/test/e2e/o04-server.mjs";

type PaperAccount = Awaited<ReturnType<typeof startO04Server>>;

export const test = base.extend<object, { paperAccount: PaperAccount }>({
  paperAccount: [
    async ({ browserName }, provideAccount) => {
      if (browserName !== "chromium") throw new Error("O04 config requires the Chromium project.");
      const { startO04Server } = await import("../../../api/test/e2e/o04-server.mjs");
      const server = await startO04Server();
      try {
        await provideAccount(server);
      } finally {
        // Worker teardown runs even after a failed browser assertion.
        await server.close();
      }
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
