"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/Badge";

import { RecentTradeRow } from "./RecentTradeRow";
import { createRecentTradesPreview } from "./recent-trades-preview";

export type RecentTradesProps = {
  baseAsset: string;
  midPrice: string;
  quoteAsset: string;
  symbol: string;
};

export function RecentTrades({ baseAsset, midPrice, quoteAsset, symbol }: RecentTradesProps) {
  const trades = createRecentTradesPreview(midPrice);
  const [showAll, setShowAll] = useState(false);
  const visibleTrades = showAll ? trades : trades.slice(0, 6);

  return (
    <section
      aria-labelledby="recent-trades-title"
      className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5 lg:min-h-12 lg:py-2">
        <div>
          <h2 id="recent-trades-title" className="text-sm font-semibold text-foreground">
            Recent trades
          </h2>
          <p className="mt-0.5 font-mono text-xs text-foreground-muted">{symbol}</p>
        </div>
        <Badge variant="neutral">Snapshot</Badge>
      </header>

      <div className="max-h-96 overflow-auto lg:min-h-0 lg:flex-1">
        <table className="w-full min-w-[28rem] table-fixed border-collapse">
          <caption className="sr-only">
            Static {symbol} recent trades preview, newest first; times shown in UTC
          </caption>
          <thead className="sticky top-0 z-10 bg-surface-elevated">
            <tr className="h-9 border-b border-border-subtle text-xs text-foreground-muted lg:h-8">
              <th className="px-4 text-left font-medium" scope="col">
                Price ({quoteAsset})
              </th>
              <th className="px-3 text-right font-medium" scope="col">
                Quantity ({baseAsset})
              </th>
              <th className="px-3 text-right font-medium" scope="col">
                Time (UTC)
              </th>
              <th className="px-4 text-right font-medium" scope="col">
                Side
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleTrades.map((trade) => (
              <RecentTradeRow key={trade.id} trade={trade} />
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-auto flex min-h-11 items-center justify-center border-t border-border-subtle bg-surface/35 px-4">
        <button
          aria-expanded={showAll}
          className="inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-brand transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => setShowAll((current) => !current)}
          type="button"
        >
          {showAll ? "Show latest trades" : "View all trades"}
          <svg
            aria-hidden="true"
            className={showAll ? "size-4 rotate-180" : "size-4"}
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="m9 6 6 6-6 6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      </footer>
    </section>
  );
}
