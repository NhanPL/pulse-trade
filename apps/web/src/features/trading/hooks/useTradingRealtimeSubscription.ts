import type { CandleInterval, RealtimeChannel } from "@pulse-trade/contracts";
import { useEffect } from "react";

import { getBrowserRealtimeRuntime } from "../../../lib/realtime/realtime-runtime";
import type { RealtimeSubscriptionManager } from "../../../lib/realtime/subscription-manager";
import {
  acquireRealtimeStoreBindings,
  type RealtimeStoreBindingRuntime,
} from "../../realtime/realtime-store-bindings";
import { candleStore } from "../../realtime/stores/candle-store";
import { orderBookStore } from "../../realtime/stores/order-book-store";
import { recentTradesStore } from "../../realtime/stores/recent-trades-store";

const TRADING_MARKET_CHANNELS = [
  "ticker",
  "orderbook",
  "trades",
] as const satisfies readonly RealtimeChannel[];
const TRADING_CANDLE_CHANNELS = ["candles"] as const satisfies readonly RealtimeChannel[];

export type TradingRealtimeRuntime = RealtimeStoreBindingRuntime &
  Readonly<{
    subscriptions: Pick<RealtimeSubscriptionManager, "subscribe">;
  }>;

export function useTradingRealtimeSubscription(
  symbol: string,
  candleInterval: CandleInterval,
): void {
  useEffect(() => {
    return subscribeToTradingMarketData(getBrowserRealtimeRuntime(), symbol);
  }, [symbol]);

  useEffect(() => {
    return subscribeToTradingCandles(getBrowserRealtimeRuntime(), symbol, candleInterval);
  }, [candleInterval, symbol]);
}

export function subscribeToTradingMarket(
  runtime: TradingRealtimeRuntime,
  symbol: string,
  candleInterval: CandleInterval = "1m",
): () => void {
  const releaseMarketData = subscribeToTradingMarketData(runtime, symbol);
  let releaseCandles: () => void;

  try {
    releaseCandles = subscribeToTradingCandles(runtime, symbol, candleInterval);
  } catch (error) {
    releaseMarketData();
    throw error;
  }

  let released = false;

  return () => {
    if (released) return;
    released = true;

    releaseCandles();
    releaseMarketData();
  };
}

export function subscribeToTradingMarketData(
  runtime: TradingRealtimeRuntime,
  symbol: string,
): () => void {
  const releaseStoreBindings = acquireRealtimeStoreBindings(runtime);
  let releaseSubscription: () => void;

  try {
    releaseSubscription = runtime.subscriptions.subscribe({
      channels: TRADING_MARKET_CHANNELS,
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
    candleStore.getState().clearCandles(symbol);
    orderBookStore.getState().clearOrderBook(symbol);
    recentTradesStore.getState().clearRecentTrades(symbol);
    releaseStoreBindings();
  };
}

export function subscribeToTradingCandles(
  runtime: TradingRealtimeRuntime,
  symbol: string,
  candleInterval: CandleInterval,
): () => void {
  return runtime.subscriptions.subscribe({
    channels: TRADING_CANDLE_CHANNELS,
    options: { candleInterval },
    symbols: [symbol],
  });
}
