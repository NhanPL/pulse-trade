import type {
  MarketLiveEvent,
  MarketStaleEvent,
  RealtimeEvent,
  TickerUpdateEvent,
} from "@pulse-trade/contracts";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export type MarketTicker = Readonly<{
  change24hPercent: string;
  eventTs: number;
  high24h: string;
  low24h: string;
  marketTs: number;
  price: string;
  symbol: string;
  volume24h: string;
}>;

export type MarketFreshness = Readonly<
  | {
      eventTs: number;
      status: "LIVE";
    }
  | {
      eventTs: number;
      lastUpdateTs: number;
      status: "STALE";
    }
>;

export type TickerStore = Readonly<{
  marketFreshness: Readonly<Record<string, MarketFreshness>>;
  tickers: Readonly<Record<string, MarketTicker>>;
  markMarketLive(event: MarketLiveEvent): void;
  markMarketStale(event: MarketStaleEvent): void;
  updateTicker(ticker: MarketTicker): void;
}>;

export type RealtimeEventSource = Readonly<{
  onEvent(listener: (event: RealtimeEvent) => void): () => void;
}>;

export const tickerStore = createStore<TickerStore>((set) => ({
  marketFreshness: {},
  tickers: {},
  markMarketLive: (event) => {
    set((currentState) => {
      const currentFreshness = currentState.marketFreshness[event.symbol];
      if (currentFreshness && currentFreshness.eventTs >= event.ts) return currentState;

      return {
        marketFreshness: {
          ...currentState.marketFreshness,
          [event.symbol]: { eventTs: event.ts, status: "LIVE" },
        },
      };
    });
  },
  markMarketStale: (event) => {
    set((currentState) => {
      const currentFreshness = currentState.marketFreshness[event.symbol];
      if (currentFreshness && currentFreshness.eventTs >= event.ts) return currentState;

      return {
        marketFreshness: {
          ...currentState.marketFreshness,
          [event.symbol]: {
            eventTs: event.ts,
            lastUpdateTs: event.data.lastUpdateTs,
            status: "STALE",
          },
        },
      };
    });
  },
  updateTicker: (ticker) => {
    set((currentState) => {
      const existingTicker = currentState.tickers[ticker.symbol];
      if (
        existingTicker &&
        (ticker.marketTs < existingTicker.marketTs ||
          (ticker.marketTs === existingTicker.marketTs && ticker.eventTs <= existingTicker.eventTs))
      ) {
        return currentState;
      }

      const currentFreshness = currentState.marketFreshness[ticker.symbol];
      const marketFreshness =
        currentFreshness && currentFreshness.eventTs > ticker.eventTs
          ? currentState.marketFreshness
          : {
              ...currentState.marketFreshness,
              [ticker.symbol]: { eventTs: ticker.eventTs, status: "LIVE" } as const,
            };

      return {
        marketFreshness,
        tickers: {
          ...currentState.tickers,
          [ticker.symbol]: ticker,
        },
      };
    });
  },
}));

export function tickerFromEvent(event: TickerUpdateEvent): MarketTicker {
  return {
    change24hPercent: event.data.change24hPercent,
    eventTs: event.ts,
    high24h: event.data.high24h,
    low24h: event.data.low24h,
    marketTs: event.data.marketTs,
    price: event.data.price,
    symbol: event.symbol,
    volume24h: event.data.volume24h,
  };
}

export function selectTicker(symbol: string) {
  return (state: TickerStore): MarketTicker | undefined => state.tickers[symbol];
}

export function useTicker(symbol: string): MarketTicker | undefined {
  return useStore(tickerStore, selectTicker(symbol));
}

export function selectMarketIsStale(symbol: string) {
  return (state: TickerStore): boolean => state.marketFreshness[symbol]?.status === "STALE";
}

export function useMarketIsStale(symbol: string): boolean {
  return useStore(tickerStore, selectMarketIsStale(symbol));
}

export function bindTickerStore(source: RealtimeEventSource): () => void {
  return source.onEvent((event) => {
    if (event.event === "ticker.update") {
      tickerStore.getState().updateTicker(tickerFromEvent(event));
      return;
    }

    if (event.event === "market.stale") {
      tickerStore.getState().markMarketStale(event);
      return;
    }

    if (event.event === "market.live") tickerStore.getState().markMarketLive(event);
  });
}
