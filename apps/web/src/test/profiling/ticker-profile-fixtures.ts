import { QueryClient } from "@tanstack/react-query";
import {
  historicalCandlesResponseSchema,
  portfolioResponseSchema,
  watchlistListResponseSchema,
  type RealtimeEvent,
  type TickerUpdateEvent,
} from "@pulse-trade/contracts";

import type { useAuthSession } from "@/features/auth/components/AuthSessionProvider";
import { portfolioQueryKeys } from "@/features/portfolio/model/query-keys";
import { bindCandleStore } from "@/features/realtime/stores/candle-store";
import {
  bindOrderBookStore,
  flushOrderBookPresentation,
  orderBookStore,
} from "@/features/realtime/stores/order-book-store";
import {
  bindRecentTradesStore,
  recentTradesStore,
} from "@/features/realtime/stores/recent-trades-store";
import { bindTickerStore } from "@/features/realtime/stores/ticker-store";
import { historicalCandlesQueryKey } from "@/features/trading/hooks/useHistoricalCandles";
import { watchlistQueryKeys } from "@/features/watchlist/model/query-keys";
import type { RealtimeMessageListener } from "@/lib/realtime/RealtimeClient";
import { RealtimeEventRouter } from "@/lib/realtime/event-router";

export const profileSession = {
  acceptLogin: () => undefined,
  getAccessToken: () => "synthetic-profile-token",
  isLoggingOut: false,
  logout: async () => undefined,
  logoutError: null,
  retry: () => undefined,
  status: "authenticated",
  user: { id: "123e4567-e89b-42d3-a456-426614174000", email: "profile@example.com" },
  waitForBootstrap: async () => undefined,
} satisfies ReturnType<typeof useAuthSession>;

export const tradingSnapshot = {
  baseAsset: "BTC",
  change24hPercent: "2",
  high24h: "51000",
  low24h: "49000",
  price: "50000",
  quoteAsset: "USD",
  symbol: "BTC-USD",
  volume24h: "100",
};

export function createProfileQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
    },
  });
  client.setQueryData(
    portfolioQueryKeys.all,
    portfolioResponseSchema.parse({
      data: {
        balances: [
          { asset: "BTC", available: "0.05", locked: "0" },
          { asset: "ETH", available: "2", locked: "0" },
          { asset: "USD", available: "4000", locked: "1000" },
        ],
        cash: { available: "4000", locked: "1000" },
        positions: [
          { asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" },
          { asset: "ETH", averageCost: "3000", quantity: "2", realizedPnl: "0" },
        ],
        quoteCurrency: "USD",
      },
    }).data,
  );
  client.setQueryData(
    watchlistQueryKeys.list(profileSession.user.id),
    watchlistListResponseSchema.parse({
      data: {
        items: ["BTC-USD", "ETH-USD"].map((symbol, index) => ({
          createdAt: "2026-10-08T00:00:00.000Z",
          id: `123e4567-e89b-42d3-a456-42661417400${index + 1}`,
          symbol,
        })),
      },
    }).data,
  );
  client.setQueryData(
    historicalCandlesQueryKey("BTC-USD", "1m"),
    historicalCandlesResponseSchema.parse({
      data: {
        candles: [
          { time: 60, open: "50000", high: "50010", low: "49990", close: "50000", volume: "1" },
        ],
        interval: "1m",
        symbol: "BTC-USD",
      },
    }).data,
  );
  return client;
}

export function tickerEvent(symbol: string, price: string, ts: number): TickerUpdateEvent {
  return {
    v: 1,
    event: "ticker.update",
    symbol,
    ts,
    data: {
      change24hPercent: "2",
      high24h: "60000",
      low24h: "1000",
      marketTs: ts,
      price,
      volume24h: "100",
    },
  };
}

/** Synthetic transport only; validation, routing and market-store ingestion are real. */
export function createProfileFeed() {
  const listeners = new Set<RealtimeMessageListener>();
  const router = new RealtimeEventRouter({
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const releaseTicker = bindTickerStore(router);
  const releaseCandle = bindCandleStore(router);
  const releaseBook = bindOrderBookStore(router);
  const releaseTrades = bindRecentTradesStore(router);
  return {
    emit(event: RealtimeEvent): void {
      for (const listener of listeners) listener(JSON.stringify(event));
    },
    listenerCount: () => listeners.size,
    destroy(): void {
      releaseTicker();
      releaseCandle();
      releaseBook();
      releaseTrades();
      router.destroy();
      orderBookStore.getState().clearOrderBook("BTC-USD");
      recentTradesStore.getState().clearRecentTrades("BTC-USD");
    },
  };
}

export function seedLiveTradingPanels(feed: ReturnType<typeof createProfileFeed>): void {
  feed.emit({
    v: 1,
    event: "orderbook.snapshot",
    symbol: "BTC-USD",
    ts: 200,
    data: {
      sequence: "1",
      asks: Array.from({ length: 20 }, (_, index) => [String(50101 + index), "0.01"]),
      bids: Array.from({ length: 20 }, (_, index) => [String(49999 - index), "0.01"]),
    },
  });
  // Settle initial snapshot publication before measurement; P01 does not change the store cadence.
  flushOrderBookPresentation();
  feed.emit({
    v: 1,
    event: "trades.batch",
    symbol: "BTC-USD",
    ts: 200,
    data: {
      trades: [
        { id: "profile-trade", marketTs: 200, price: "50000", quantity: "0.01", side: "BUY" },
      ],
    },
  });
}
