import { clearInterval, setInterval } from "node:timers";

/**
 * A single fixed BTC ticker is a prerequisite for the registration/BUY scenario,
 * not a general-purpose realtime simulator. Production still uses Coinbase.
 * @returns {import("../../src/markets/provider/market-data-provider").MarketDataProvider}
 */
export function createO04MarketFixture() {
  /** @type {Set<import("../../src/markets/provider/market-data-provider").ProviderEventListener>} */
  const eventListeners = new Set();
  /** @type {Set<import("../../src/markets/provider/market-data-provider").ProviderConnectionStateListener>} */
  const connectionListeners = new Set();
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  let sequence = 0;

  function publish() {
    /** @type {import("../../src/markets/provider/market-data-provider").ProviderTickerEvent} */
    const ticker = {
      change24hPercent: "0",
      high24h: "50000",
      low24h: "50000",
      marketTs: Date.now(),
      price: "50000",
      providerSequence: ++sequence,
      symbol: "BTC-USD",
      type: "ticker",
      volume24h: "100",
    };
    for (const listener of eventListeners) listener(ticker);
  }

  return {
    async connect() {
      if (timer) return;
      for (const listener of connectionListeners) listener({ state: "CONNECTED", ts: Date.now() });
      // Keep backend freshness honest during browser navigation without disabling stale checks.
      timer = setInterval(publish, 1_000);
      timer.unref();
      publish();
    },
    async close() {
      if (timer) clearInterval(timer);
      timer = undefined;
      for (const listener of connectionListeners)
        listener({ state: "DISCONNECTED", ts: Date.now() });
      eventListeners.clear();
      connectionListeners.clear();
    },
    async getHistoricalCandles({ interval, limit, symbol }) {
      if (symbol !== "BTC-USD") throw new Error("O04 fixture supports only BTC-USD.");
      const seconds = { "1m": 60, "5m": 300, "15m": 900, "1h": 3_600 }[interval];
      const end = Math.floor(Date.now() / 1_000 / seconds) * seconds;
      return Array.from({ length: limit }, (_, index) => ({
        close: "50000",
        high: "50000",
        low: "50000",
        open: "50000",
        time: end - (limit - 1 - index) * seconds,
        volume: "1",
      }));
    },
    onConnectionState(listener) {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribe() {},
    unsubscribe() {},
  };
}
