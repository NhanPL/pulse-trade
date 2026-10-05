"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WatchlistRequestError } from "../api/watchlist";
import { useWatchlistItems } from "../hooks/useWatchlist";
import { useWatchlistRealtime } from "../hooks/useWatchlistRealtime";
import { watchlistTickerSymbols } from "../model/watchlist-market";
import { WatchlistEmptyState } from "./WatchlistEmptyState";
import { WatchlistMarketRow } from "./WatchlistMarketRow";
import { WatchlistMarketStatus } from "./WatchlistMarketStatus";
import { WatchlistStatus } from "./WatchlistStatus";
import { WatchlistSummary } from "./WatchlistSummary";

function WatchlistPending() {
  return (
    <div aria-label="Watchlist loading" className="space-y-8" role="status">
      <p className="sr-only">Loading your saved markets</p>
      <Skeleton className="min-h-28" />
      <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-5">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton className="min-h-20" key={row} />
        ))}
      </div>
    </div>
  );
}

export function WatchlistDashboard() {
  const query = useWatchlistItems();
  const expired =
    query.error instanceof WatchlistRequestError && query.error.code === "UNAUTHENTICATED";
  const symbols = useMemo(
    () => (!expired && query.data ? watchlistTickerSymbols(query.data) : []),
    [expired, query.data],
  );
  const allSymbols = useMemo(() => query.data?.map((item) => item.symbol) ?? [], [query.data]);
  useWatchlistRealtime(symbols);

  if (query.isPending) return <WatchlistPending />;
  if (!query.data || expired)
    return (
      <ErrorState
        title={expired ? "Sign in to view your watchlist" : "Watchlist unavailable"}
        description={
          query.error instanceof WatchlistRequestError
            ? query.error.message
            : "We couldn't load your saved markets. Please try again."
        }
        isRetrying={query.isFetching}
        onRetry={expired ? undefined : () => void query.refetch()}
        action={
          expired ? (
            <Link
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-foreground-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              href="/login?returnTo=%2Fwatchlist"
            >
              Sign in again
            </Link>
          ) : undefined
        }
      />
    );

  return (
    <>
      <WatchlistSummary count={query.data.length} symbols={allSymbols} />
      <section
        aria-label="Saved markets"
        className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated/70 shadow-panel"
      >
        <WatchlistStatus returnTo="/watchlist" />
        {query.data.length === 0 ? (
          <WatchlistEmptyState />
        ) : (
          <table className="block w-full border-collapse text-left lg:table">
            <caption className="sr-only">
              Saved markets with live price, 24-hour change, base-asset volume and remove actions
            </caption>
            <thead className="hidden lg:table-header-group">
              <tr className="border-b border-border-subtle bg-surface/60 text-sm text-foreground-secondary">
                <th className="px-7 py-5 font-medium" scope="col">
                  Symbol
                </th>
                <th className="px-7 py-5 text-right font-medium" scope="col">
                  Price
                </th>
                <th className="px-7 py-5 text-right font-medium" scope="col">
                  24h Change
                </th>
                <th className="px-7 py-5 text-right font-medium" scope="col">
                  Volume (24h)
                </th>
                <th className="px-7 py-5 text-center font-medium" scope="col">
                  Remove
                </th>
              </tr>
            </thead>
            <tbody className="grid gap-4 p-3 sm:grid-cols-2 sm:p-5 lg:table-row-group lg:p-0">
              {query.data.map((item) => (
                <WatchlistMarketRow key={item.symbol} symbol={item.symbol} />
              ))}
            </tbody>
          </table>
        )}
      </section>
      <WatchlistMarketStatus symbols={symbols} />
    </>
  );
}
