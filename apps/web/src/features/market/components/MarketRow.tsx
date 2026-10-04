import { memo } from "react";

import { classNames } from "@/components/ui/class-names";
import { WatchlistToggle } from "@/features/watchlist/components/WatchlistToggle";
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
      <td className="absolute right-3 top-3 block p-0 md:sticky md:right-0 md:top-auto md:table-cell md:bg-surface-elevated md:px-5 md:py-4 md:text-center">
        <WatchlistToggle symbol={market.symbol} />
      </td>
    </tr>
  );
});
