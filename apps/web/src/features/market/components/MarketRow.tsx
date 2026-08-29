import Link from "next/link";
import { memo } from "react";

import { classNames } from "@/components/ui/class-names";

import type { MarketTableItem } from "../model/market-table";
import {
  formatMarketPrice,
  formatMarketVolume,
  formatPercentChange,
} from "../utils/format-market-value";
import { LiveMarketPrice } from "./LiveMarketPrice";

export type MarketRowProps = {
  market: MarketTableItem;
};

// Search, sorting, and later ticker updates preserve unchanged market object references, allowing
// React to skip every row except the symbol whose snapshot changed.
export const MarketRow = memo(function MarketRow({ market }: MarketRowProps) {
  const isPositive = Number(market.change24hPercent) >= 0;

  return (
    <tr className="border-b border-border-subtle transition-colors last:border-b-0 hover:bg-surface-hover/70">
      <th className="px-5 py-4 font-normal" scope="row">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full border border-brand/25 bg-brand-subtle text-xs font-bold text-brand"
          >
            {market.baseAsset.slice(0, 1)}
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">
              {market.baseAsset}
              <span className="font-normal text-foreground-muted">/{market.quoteAsset}</span>
            </span>
            <span className="block text-xs text-foreground-muted">{market.symbol}</span>
          </span>
        </div>
      </th>
      <td className="px-4 py-4 text-right text-sm text-foreground">
        <LiveMarketPrice price={market.price} symbol={market.symbol} />
      </td>
      <td
        className={classNames(
          "px-4 py-4 text-right font-mono text-sm font-semibold tabular-nums",
          isPositive ? "text-positive" : "text-negative",
        )}
      >
        {formatPercentChange(market.change24hPercent)}
      </td>
      <td className="px-4 py-4 text-right font-mono text-sm tabular-nums text-foreground-secondary">
        {formatMarketPrice(market.high24h)}
      </td>
      <td className="px-4 py-4 text-right font-mono text-sm tabular-nums text-foreground-secondary">
        {formatMarketPrice(market.low24h)}
      </td>
      <td className="px-4 py-4 text-right font-mono text-sm tabular-nums text-foreground-secondary">
        {formatMarketVolume(market.volume24h)}
      </td>
      <td className="px-5 py-4 text-center">
        <Link
          aria-label={`Sign in to add ${market.symbol} to watchlist`}
          className="inline-grid size-9 place-items-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-selected hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          href="/login"
          title="Sign in to add to watchlist"
        >
          <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
            <path
              d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
        </Link>
      </td>
    </tr>
  );
});
