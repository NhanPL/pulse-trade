import Link from "next/link";
import { memo } from "react";

import { classNames } from "@/components/ui/class-names";
import {
  formatMarketPrice,
  formatMarketVolume,
  formatPercentChange,
} from "@/lib/format/market-value";

import type { MarketTableItem } from "../model/market-table";
import { LiveMarketPrice } from "./LiveMarketPrice";

export type MarketRowProps = {
  market: MarketTableItem;
};

// Search, sorting, and later ticker updates preserve unchanged market object references, allowing
// React to skip every row except the symbol whose snapshot changed.
export const MarketRow = memo(function MarketRow({ market }: MarketRowProps) {
  const isPositive = Number(market.change24hPercent) >= 0;

  return (
    <tr className="relative grid grid-cols-2 overflow-hidden rounded-lg border border-border-subtle bg-surface transition-colors hover:bg-surface-hover/70 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:last:border-b-0">
      <th
        className="col-span-2 block px-4 py-4 pr-16 text-left font-normal md:table-cell md:px-5 md:py-4 md:pr-5"
        scope="row"
      >
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
      <td className="block border-t border-border-subtle px-4 py-3 text-left text-sm text-foreground md:table-cell md:border-t-0 md:py-4 md:text-right">
        <span className="mb-1 block text-xs font-normal text-foreground-muted md:hidden">
          Price
        </span>
        <LiveMarketPrice price={market.price} symbol={market.symbol} />
      </td>
      <td
        className={classNames(
          "block border-t border-border-subtle px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums md:table-cell md:border-t-0 md:py-4",
          isPositive ? "text-positive" : "text-negative",
        )}
      >
        <span className="mb-1 block font-sans text-xs font-normal text-foreground-muted md:hidden">
          24h change
        </span>
        {formatPercentChange(market.change24hPercent)}
      </td>
      <td className="block border-t border-border-subtle bg-surface-elevated/45 px-4 py-3 text-left font-mono text-sm tabular-nums text-foreground-secondary md:table-cell md:border-t-0 md:bg-transparent md:py-4 md:text-right">
        <span className="mb-1 block font-sans text-xs text-foreground-muted md:hidden">
          24h high
        </span>
        {formatMarketPrice(market.high24h)}
      </td>
      <td className="block border-t border-border-subtle bg-surface-elevated/45 px-4 py-3 text-right font-mono text-sm tabular-nums text-foreground-secondary md:table-cell md:border-t-0 md:bg-transparent md:py-4">
        <span className="mb-1 block font-sans text-xs text-foreground-muted md:hidden">
          24h low
        </span>
        {formatMarketPrice(market.low24h)}
      </td>
      <td className="col-span-2 block border-t border-border-subtle bg-surface-elevated/45 px-4 py-3 text-left font-mono text-sm tabular-nums text-foreground-secondary md:table-cell md:border-t-0 md:bg-transparent md:py-4 md:text-right">
        <span className="mb-1 block font-sans text-xs text-foreground-muted md:hidden">
          24h volume
        </span>
        {formatMarketVolume(market.volume24h)}
      </td>
      <td className="absolute right-3 top-3 block p-0 md:static md:table-cell md:px-5 md:py-4 md:text-center">
        <Link
          aria-label={`Sign in to add ${market.symbol} to watchlist`}
          className="inline-grid size-10 place-items-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-selected hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:size-9"
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
