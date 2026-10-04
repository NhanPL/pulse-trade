"use client";

import Link from "next/link";
import { memo } from "react";

import { Button } from "@/components/ui/Button";
import { classNames } from "@/components/ui/class-names";
import { isSupportedMarketSymbol } from "@/features/market/model/supported-markets";
import { useRealtimeConnectionState } from "@/features/realtime/stores/connection-state-store";
import { useMarketIsStale, useTicker } from "@/features/realtime/stores/ticker-store";
import { formatMarketPrice, formatPercentChange } from "@/lib/format/market-value";
import { useWatchlistToggle } from "../hooks/useWatchlistToggle";
import {
  formatWatchlistVolume,
  watchlistMarketIdentity,
  watchlistMarketStatus,
} from "../model/watchlist-market";

const marks: Readonly<Record<string, { mark: string; className: string }>> = {
  BTC: { mark: "₿", className: "border-orange-300/30 bg-orange-500 text-white" },
  ETH: { mark: "◆", className: "border-indigo-300/30 bg-indigo-500/80 text-white" },
  SOL: { mark: "≋", className: "border-purple-300/30 bg-slate-950 text-teal-300" },
  ADA: { mark: "A", className: "border-blue-400/30 bg-blue-500/80 text-white" },
  XRP: { mark: "X", className: "border-slate-300/30 bg-slate-600 text-white" },
};

function RemoveButton({ symbol }: { symbol: string }) {
  const action = useWatchlistToggle(symbol);
  return (
    <Button
      aria-label={`Remove ${symbol} from watchlist`}
      className="rounded-full! border border-border-subtle"
      disabled={action.disabled || !action.saved}
      isLoading={action.pending}
      onClick={(event) => {
        event.stopPropagation();
        if (action.saved) action.toggle();
      }}
      size="icon"
      title={`Remove ${symbol} from watchlist`}
      variant="ghost"
    >
      {!action.pending ? (
        <svg aria-hidden="true" className="size-5 text-negative" fill="none" viewBox="0 0 24 24">
          <path
            d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 10v7m4-7v7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
        </svg>
      ) : null}
    </Button>
  );
}

// Each row owns its symbol's ticker/freshness; price ticks never rerender the REST list.
export const WatchlistMarketRow = memo(function WatchlistMarketRow({ symbol }: { symbol: string }) {
  const ticker = useTicker(symbol);
  const stale = useMarketIsStale(symbol);
  const connection = useRealtimeConnectionState();
  const market = watchlistMarketIdentity(symbol);
  const supported = isSupportedMarketSymbol(symbol);
  const status = supported ? watchlistMarketStatus(ticker, stale, connection) : "Unavailable";
  const change = ticker ? Number(ticker.change24hPercent) : 0;
  const mark = marks[market.baseAsset];
  const identity = (
    <span className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={classNames(
          "grid size-11 shrink-0 place-items-center rounded-full border text-xl font-bold",
          mark?.className ?? "border-brand/25 bg-brand-subtle text-brand",
        )}
      >
        {mark?.mark ?? market.baseAsset.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-foreground">
          {market.baseAsset}/{market.quoteAsset}
        </span>
        <span className="mt-0.5 block text-xs text-foreground-muted">
          {market.name} / {market.quoteAsset === "USD" ? "US Dollar" : market.quoteAsset}
        </span>
      </span>
    </span>
  );
  return (
    <tr className="relative grid grid-cols-2 overflow-hidden rounded-xl border border-border-subtle bg-surface lg:table-row lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:last:border-b-0">
      <th
        className="col-span-2 px-4 py-5 pr-16 text-left font-normal lg:px-7 lg:py-6 lg:pr-7"
        scope="row"
      >
        {supported ? (
          <Link
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            href={`/trade/${symbol}`}
            aria-label={`Trade ${symbol}`}
          >
            {identity}
          </Link>
        ) : (
          identity
        )}
      </th>
      <td className="border-t border-border-subtle px-4 py-4 lg:border-t-0 lg:px-7 lg:text-right">
        <span className="mb-1 block text-xs text-foreground-muted lg:hidden">Price</span>
        <span className="block font-mono text-base font-semibold tabular-nums">
          {ticker ? formatMarketPrice(ticker.price) : "—"}
        </span>
        <span
          className={classNames(
            "mt-1 block text-xs",
            status === "Live" ? "text-foreground-muted" : "text-warning",
          )}
        >
          {status === "Live" ? market.quoteAsset : status}
        </span>
      </td>
      <td className="border-t border-border-subtle px-4 py-4 text-right lg:border-t-0 lg:px-7">
        <span className="mb-1 block text-xs text-foreground-muted lg:hidden">24h change</span>
        <span
          className={classNames(
            "font-mono text-base font-semibold tabular-nums",
            ticker
              ? change > 0
                ? "text-positive"
                : change < 0
                  ? "text-negative"
                  : "text-foreground-secondary"
              : "text-foreground-muted",
          )}
        >
          {ticker ? formatPercentChange(ticker.change24hPercent) : "—"}
        </span>
      </td>
      <td className="col-span-2 border-t border-border-subtle px-4 py-4 lg:border-t-0 lg:px-7 lg:text-right">
        <span className="mb-1 block text-xs text-foreground-muted lg:hidden">24h volume</span>
        <span className="font-mono text-sm tabular-nums text-foreground-secondary">
          {ticker ? `${formatWatchlistVolume(ticker.volume24h)} ${market.baseAsset}` : "—"}
        </span>
      </td>
      <td className="absolute right-3 top-5 lg:static lg:px-7 lg:py-6 lg:text-center">
        <RemoveButton symbol={symbol} />
      </td>
    </tr>
  );
});
