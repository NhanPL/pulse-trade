"use client";

import { useMemo } from "react";
import { useStore } from "zustand";

import { useRealtimeConnectionState } from "@/features/realtime/stores/connection-state-store";
import { tickerStore, type TickerStore } from "@/features/realtime/stores/ticker-store";
import { formatPercentChange } from "@/lib/format/market-value";
import { watchlistTopMoverKey } from "../model/watchlist-market";

function TopMover({ symbols }: { symbols: readonly string[] }) {
  const connection = useRealtimeConnectionState();
  const selector = useMemo(
    () => (state: TickerStore) => watchlistTopMoverKey(symbols, state),
    [symbols],
  );
  const key = useStore(tickerStore, selector);
  const [symbol = "", change = ""] = key.split("|");
  if (!symbol || connection !== "CONNECTED")
    return (
      <span className="text-sm text-foreground-muted">
        {symbols.length === 0
          ? "—"
          : connection !== "CONNECTED"
            ? "Market data unavailable"
            : "Waiting for fresh prices"}
      </span>
    );
  const amount = Number(change);
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-lg font-semibold">{symbol.replace("-", "/")}</span>
      <span
        className={`font-mono text-base font-semibold tabular-nums ${amount > 0 ? "text-positive" : amount < 0 ? "text-negative" : "text-foreground-secondary"}`}
      >
        {formatPercentChange(change)}
      </span>
    </span>
  );
}

export function WatchlistSummary({
  count,
  symbols,
}: {
  count: number;
  symbols: readonly string[];
}) {
  return (
    <section
      aria-label="Watchlist summary"
      className="rounded-xl border border-border-subtle bg-surface-elevated/70 px-5 py-6 shadow-panel sm:px-7"
    >
      <dl className="grid gap-5 sm:grid-cols-[minmax(12rem,0.7fr)_minmax(0,2fr)] sm:gap-7">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-full border border-brand/25 bg-brand-subtle/60 text-brand"
          >
            <svg className="size-6" fill="none" viewBox="0 0 24 24">
              <path
                d="M6 4h12v17l-6-4-6 4V4Z"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.75"
              />
            </svg>
          </span>
          <div>
            <dt className="text-sm text-foreground-secondary">Total Watched</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{count}</span>{" "}
              <span className="text-sm text-foreground-muted">
                {count === 1 ? "symbol" : "symbols"}
              </span>
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-4 border-t border-border-subtle pt-5 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-full border border-border bg-surface text-positive"
          >
            <svg className="size-6" fill="none" viewBox="0 0 24 24">
              <path
                d="m3 17 6-6 4 4 8-10M15 5h6v6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <dt className="text-sm text-foreground-secondary">Top Mover (24h)</dt>
            <dd className="mt-1">
              <TopMover symbols={symbols} />
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
