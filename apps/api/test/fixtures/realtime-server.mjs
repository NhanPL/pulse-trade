import { createRequire } from "node:module";
import { MockMarketDataProvider } from "./mock-market-provider.mts";

const require = createRequire(import.meta.url);

/** Real public Nest REST/WS boundary without auth, Prisma or an external exchange. */
export async function startMockRealtimeServer({ port = 0 } = {}) {
  const { Test } = require("@nestjs/testing");
  const { WsAdapter } = require("@nestjs/platform-ws");
  const { RealtimeModule } = require("../../dist/realtime/realtime.module.js");
  const { MARKET_DATA_PROVIDER } = require("../../dist/markets/provider/market-data-provider.js");
  const { MarketFreshnessService } = require("../../dist/realtime/freshness.service.js");
  const { SubscriptionRegistry } = require("../../dist/realtime/subscription-registry.service.js");
  const { parseRealtimeMessage } = require("../../dist/realtime/realtime-message-parser.js");
  const { configureHttpApplication } = require("../../dist/config/http-application.js");
  let now = Date.now();
  const provider = new MockMarketDataProvider({ now: () => now });
  const module = await Test.createTestingModule({
    imports: [RealtimeModule],
  })
    .overrideProvider(MARKET_DATA_PROVIDER)
    .useValue(provider)
    // Use the real freshness service with its existing clock/scheduler configuration seam.
    .overrideProvider(MarketFreshnessService)
    .useFactory({
      factory: (marketProvider, subscriptions) =>
        new MarketFreshnessService(marketProvider, subscriptions, {
          now: () => now,
          checkIntervalMs: 25,
        }),
      inject: [MARKET_DATA_PROVIDER, SubscriptionRegistry],
    })
    .compile();
  const freshness = module.get(MarketFreshnessService);
  const registry = module.get(SubscriptionRegistry);
  const app = module.createNestApplication({ logger: false });
  const upgrades = new Set();
  app.getHttpServer().on("upgrade", (_request, socket) => {
    upgrades.add(socket);
    socket.once("close", () => upgrades.delete(socket));
  });
  configureHttpApplication(app, { webOrigin: "http://127.0.0.1:3110" });
  app.useWebSocketAdapter(new WsAdapter(app, { messageParser: parseRealtimeMessage }));
  const close = async () => {
    for (const socket of upgrades) socket.destroy();
    await app.close();
    await provider.close();
  };
  try {
    await app.listen(port, "127.0.0.1");
    return {
      url: await app.getUrl(),
      provider,
      close,
      activeClientCount: () => registry.activeClientCount,
      freshness: (symbol) => freshness.getCurrentEvent(symbol),
      disconnectClients: () => {
        for (const socket of upgrades) socket.destroy();
      },
      advanceTime: (milliseconds) => {
        if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
          throw new Error("Mock time must advance by a non-negative integer.");
        now += milliseconds;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
