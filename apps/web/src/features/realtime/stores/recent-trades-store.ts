import type { RealtimeEvent, Trade, TradesBatchEvent } from "@pulse-trade/contracts";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export const RECENT_TRADES_LIMIT = 50;

export type RecentTrade = Readonly<Trade>;

const EMPTY_RECENT_TRADES: readonly RecentTrade[] = [];

export type RecentTradesStore = Readonly<{
  clearRecentTrades(symbol: string): void;
  recentTradesBySymbol: Readonly<Record<string, readonly RecentTrade[]>>;
  updateRecentTrades(symbol: string, trades: readonly RecentTrade[]): void;
}>;

export type RealtimeEventSource = Readonly<{
  onEvent(listener: (event: RealtimeEvent) => void): () => void;
}>;

export const recentTradesStore = createStore<RecentTradesStore>((set) => ({
  clearRecentTrades: (symbol) => {
    set((currentState) => {
      if (!(symbol in currentState.recentTradesBySymbol)) return currentState;

      const recentTradesBySymbol = { ...currentState.recentTradesBySymbol };
      delete recentTradesBySymbol[symbol];
      return { recentTradesBySymbol };
    });
  },
  recentTradesBySymbol: {},
  updateRecentTrades: (symbol, trades) => {
    if (trades.length === 0) return;

    set((currentState) => {
      const existingTrades = currentState.recentTradesBySymbol[symbol] ?? [];
      const mergedTrades = mergeRecentTrades(existingTrades, trades);
      if (haveSameTrades(existingTrades, mergedTrades)) return currentState;

      return {
        recentTradesBySymbol: {
          ...currentState.recentTradesBySymbol,
          [symbol]: mergedTrades,
        },
      };
    });
  },
}));

export function recentTradesFromEvent(event: TradesBatchEvent): readonly RecentTrade[] {
  return event.data.trades.map((trade) => ({ ...trade }));
}

export function selectRecentTrades(symbol: string) {
  return (state: RecentTradesStore): readonly RecentTrade[] =>
    state.recentTradesBySymbol[symbol] ?? EMPTY_RECENT_TRADES;
}

export function useRecentTrades(symbol: string): readonly RecentTrade[] {
  return useStore(recentTradesStore, selectRecentTrades(symbol));
}

export function bindRecentTradesStore(source: RealtimeEventSource): () => void {
  return source.onEvent((event) => {
    if (event.event !== "trades.batch") return;

    recentTradesStore.getState().updateRecentTrades(event.symbol, recentTradesFromEvent(event));
  });
}

function haveSameTrades(left: readonly RecentTrade[], right: readonly RecentTrade[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (trade, index) =>
        trade.id === right[index]?.id &&
        trade.marketTs === right[index]?.marketTs &&
        trade.price === right[index]?.price &&
        trade.quantity === right[index]?.quantity &&
        trade.side === right[index]?.side,
    )
  );
}

function mergeRecentTrades(
  existingTrades: readonly RecentTrade[],
  incomingTrades: readonly RecentTrade[],
): RecentTrade[] {
  const tradesById = new Map<string, RecentTrade>();

  for (const trade of [...existingTrades, ...incomingTrades]) {
    const existingTrade = tradesById.get(trade.id);
    if (!existingTrade || trade.marketTs >= existingTrade.marketTs) {
      tradesById.set(trade.id, trade);
    }
  }

  return [...tradesById.values()]
    .sort((left, right) => right.marketTs - left.marketTs || left.id.localeCompare(right.id))
    .slice(0, RECENT_TRADES_LIMIT);
}
