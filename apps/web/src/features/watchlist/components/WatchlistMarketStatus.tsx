"use client";

import { useMemo } from "react";
import { useStore } from "zustand";

import { Badge } from "@/components/ui/Badge";
import { useRealtimeConnectionState } from "@/features/realtime/stores/connection-state-store";
import { tickerStore, type TickerStore } from "@/features/realtime/stores/ticker-store";
import { watchlistFreshnessKey } from "../model/watchlist-market";

export function WatchlistMarketStatus({ symbols }: { symbols: readonly string[] }) {
  const connection = useRealtimeConnectionState();
  const selector = useMemo(
    () => (state: TickerStore) => watchlistFreshnessKey(symbols, state),
    [symbols],
  );
  const freshness = useStore(tickerStore, selector);
  const delayed = connection !== "CONNECTED" || freshness.includes("Delayed");
  const waiting = freshness.includes("Waiting");
  const message =
    symbols.length === 0
      ? "No market subscriptions."
      : delayed
        ? "Market data is delayed. Last known values remain visible."
        : waiting
          ? "Waiting for live market prices."
          : "Prices and data are real-time.";
  return (
    <footer
      className="flex flex-wrap items-center justify-center gap-3 text-center text-sm text-foreground-muted"
      role="status"
    >
      <span>{message}</span>
      {symbols.length > 0 ? (
        <Badge showDot variant={delayed ? "warning" : waiting ? "info" : "positive"}>
          {delayed
            ? connection === "RECONNECTING"
              ? "Reconnecting"
              : "Delayed"
            : waiting
              ? "Waiting"
              : "Live"}
        </Badge>
      ) : null}
    </footer>
  );
}
