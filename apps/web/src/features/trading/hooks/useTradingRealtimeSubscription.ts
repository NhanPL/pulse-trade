import type { RealtimeChannel } from "@pulse-trade/contracts";
import { useEffect } from "react";

import { getBrowserRealtimeRuntime } from "../../../lib/realtime/realtime-runtime";
import type { RealtimeSubscriptionManager } from "../../../lib/realtime/subscription-manager";
import {
  acquireRealtimeStoreBindings,
  type RealtimeStoreBindingRuntime,
} from "../../realtime/realtime-store-bindings";
import { orderBookStore } from "../../realtime/stores/order-book-store";
import { recentTradesStore } from "../../realtime/stores/recent-trades-store";

const TRADING_REALTIME_CHANNELS = [
  "ticker",
  "candles",
  "orderbook",
  "trades",
] as const satisfies readonly RealtimeChannel[];

export type TradingRealtimeRuntime = RealtimeStoreBindingRuntime &
  Readonly<{
    subscriptions: Pick<RealtimeSubscriptionManager, "subscribe">;
  }>;

export function useTradingRealtimeSubscription(symbol: string): void {
  useEffect(() => {
    return subscribeToTradingMarket(getBrowserRealtimeRuntime(), symbol);
  }, [symbol]);
}

export function subscribeToTradingMarket(
  runtime: TradingRealtimeRuntime,
  symbol: string,
): () => void {
  const releaseStoreBindings = acquireRealtimeStoreBindings(runtime);
  let releaseSubscription: () => void;

  try {
    releaseSubscription = runtime.subscriptions.subscribe({
      channels: TRADING_REALTIME_CHANNELS,
      options: { candleInterval: "1m" },
      symbols: [symbol],
    });
  } catch (error) {
    releaseStoreBindings();
    throw error;
  }

  let released = false;

  return () => {
    if (released) return;
    released = true;

    releaseSubscription();
    orderBookStore.getState().clearOrderBook(symbol);
    recentTradesStore.getState().clearRecentTrades(symbol);
    releaseStoreBindings();
  };
}
