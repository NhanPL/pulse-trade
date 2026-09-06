import type {
  Candle,
  CandleInterval,
  CandleSnapshotEvent,
  CandleUpdateEvent,
  RealtimeEvent,
} from "@pulse-trade/contracts";
import { createStore } from "zustand/vanilla";

export type CurrentCandle = Readonly<{
  candle: Candle;
  eventTs: number;
}>;

export type CandleStore = Readonly<{
  applySnapshot(event: CandleSnapshotEvent): void;
  applyUpdate(event: CandleUpdateEvent): void;
  clearCandles(symbol: string): void;
  currentCandles: Readonly<Record<string, CurrentCandle>>;
}>;

export type RealtimeEventSource = Readonly<{
  onEvent(listener: (event: RealtimeEvent) => void): () => void;
}>;

export const candleStore = createStore<CandleStore>((set) => ({
  applySnapshot: (event) => {
    const latestCandle = event.data.candles.reduce<Candle | undefined>(
      (latest, candle) => (!latest || candle.time > latest.time ? candle : latest),
      undefined,
    );
    if (!latestCandle) return;

    updateCurrentCandle(set, event.symbol, event.data.interval, latestCandle, event.ts);
  },
  applyUpdate: (event) => {
    updateCurrentCandle(set, event.symbol, event.data.interval, event.data.candle, event.ts);
  },
  clearCandles: (symbol) => {
    const prefix = `${symbol}\u0000`;

    set((currentState) => {
      const keysToRemove = Object.keys(currentState.currentCandles).filter((key) =>
        key.startsWith(prefix),
      );
      if (keysToRemove.length === 0) return currentState;

      const currentCandles = { ...currentState.currentCandles };
      for (const key of keysToRemove) delete currentCandles[key];

      return { currentCandles };
    });
  },
  currentCandles: {},
}));

export function selectCurrentCandle(symbol: string, interval: CandleInterval) {
  const key = createCandleKey(symbol, interval);

  return (state: CandleStore): CurrentCandle | undefined => state.currentCandles[key];
}

export function bindCandleStore(source: RealtimeEventSource): () => void {
  return source.onEvent((event) => {
    if (event.event === "candle.snapshot") {
      candleStore.getState().applySnapshot(event);
      return;
    }

    if (event.event === "candle.update") {
      candleStore.getState().applyUpdate(event);
    }
  });
}

function createCandleKey(symbol: string, interval: CandleInterval): string {
  return `${symbol}\u0000${interval}`;
}

function shouldReplaceCurrentCandle(
  existing: CurrentCandle | undefined,
  candle: Candle,
  eventTs: number,
): boolean {
  if (!existing) return true;
  if (candle.time !== existing.candle.time) return candle.time > existing.candle.time;

  return eventTs >= existing.eventTs;
}

function updateCurrentCandle(
  set: (
    partial:
      | CandleStore
      | Partial<CandleStore>
      | ((state: CandleStore) => CandleStore | Partial<CandleStore>),
    replace?: false,
  ) => void,
  symbol: string,
  interval: CandleInterval,
  candle: Candle,
  eventTs: number,
): void {
  const key = createCandleKey(symbol, interval);

  set((currentState) => {
    const existing = currentState.currentCandles[key];
    if (!shouldReplaceCurrentCandle(existing, candle, eventTs)) return currentState;

    return {
      currentCandles: {
        ...currentState.currentCandles,
        [key]: { candle: { ...candle }, eventTs },
      },
    };
  });
}
