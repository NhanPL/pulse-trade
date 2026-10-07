import { test as base } from "@playwright/test";
import type { startMockRealtimeServer } from "../../../api/test/fixtures/realtime-server.mjs";

type RealtimeServer = Awaited<ReturnType<typeof startMockRealtimeServer>>;

export const test = base.extend<{ realtimeServer: RealtimeServer }>({
  realtimeServer: [
    async ({ browserName }, provideServer) => {
      if (browserName !== "chromium") throw new Error("Realtime tests require Chromium.");
      const { startMockRealtimeServer } =
        await import("../../../api/test/fixtures/realtime-server.mjs");
      const server = await startMockRealtimeServer({ port: 3111 });
      try {
        await provideServer(server);
      } finally {
        await server.close();
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
