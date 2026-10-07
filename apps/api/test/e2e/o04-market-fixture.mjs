import { clearInterval, setInterval } from "node:timers";
import { MockMarketDataProvider } from "../fixtures/mock-market-provider.mts";

/**
 * Keep financial E2E prices fixed while using the shared O07 normalized provider.
 * @returns {import("../../src/markets/provider/market-data-provider").MarketDataProvider}
 */
export function createO04MarketFixture() {
  const provider = new MockMarketDataProvider({ prices: { "BTC-USD": "50000" } });
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;

  return {
    async connect() {
      if (timer) return;
      await provider.connect();
      // Keep backend freshness honest during browser navigation without disabling stale checks.
      timer = setInterval(() => provider.ticker("BTC-USD"), 1_000);
      timer.unref();
    },
    async close() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await provider.close();
    },
    async getHistoricalCandles({ interval, limit, symbol }) {
      if (symbol !== "BTC-USD") throw new Error("O04 fixture supports only BTC-USD.");
      return provider.getHistoricalCandles({ interval, limit, symbol });
    },
    onConnectionState(listener) {
      return provider.onConnectionState(listener);
    },
    onEvent(listener) {
      return provider.onEvent(listener);
    },
    subscribe(request) {
      provider.subscribe({
        ...request,
        symbols: request.symbols.filter((symbol) => symbol === "BTC-USD"),
      });
    },
    unsubscribe(request) {
      provider.unsubscribe(request);
    },
  };
}
