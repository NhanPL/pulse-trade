import type { RealtimeEvent, TickerUpdateEvent } from "@pulse-trade/contracts";
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

export type TickerStore = Readonly<{
  tickers: Readonly<Record<string, MarketTicker>>;
  updateTicker(ticker: MarketTicker): void;
}>;

export type RealtimeEventSource = Readonly<{
  onEvent(listener: (event: RealtimeEvent) => void): () => void;
}>;

export const tickerStore = createStore<TickerStore>((set) => ({
  tickers: {},
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

      return {
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

export function bindTickerStore(source: RealtimeEventSource): () => void {
  return source.onEvent((event) => {
    if (event.event !== "ticker.update") return;

    tickerStore.getState().updateTicker(tickerFromEvent(event));
  });
}
