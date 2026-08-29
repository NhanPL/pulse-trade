import { Badge } from "@/components/ui/Badge";
import { formatMarketPrice } from "@/lib/format/market-value";

import { OrderBookLevelRow } from "./OrderBookLevelRow";
import { createOrderBookPreview } from "./order-book-preview";

export type OrderBookProps = {
  baseAsset: string;
  midPrice: string;
  quoteAsset: string;
  symbol: string;
};

export function OrderBook({ baseAsset, midPrice, quoteAsset, symbol }: OrderBookProps) {
  const preview = createOrderBookPreview(midPrice);

  return (
    <section
      aria-labelledby="order-book-title"
      className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5 lg:min-h-12 lg:py-2">
        <div>
          <h2 id="order-book-title" className="text-sm font-semibold text-foreground">
            Order book
          </h2>
          <p className="mt-0.5 font-mono text-xs text-foreground-muted">{symbol}</p>
        </div>
        <Badge variant="neutral">Snapshot</Badge>
      </header>

      <div className="max-h-[32rem] overflow-y-auto lg:min-h-0 lg:flex-1">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            Static {symbol} order-book preview with asks sorted ascending and bids sorted descending
          </caption>
          <thead className="sticky top-0 z-10 bg-surface-elevated">
            <tr className="h-9 border-b border-border-subtle text-xs text-foreground-muted">
              <th className="px-4 text-left font-medium" scope="col">
                Price ({quoteAsset})
              </th>
              <th className="px-3 text-right font-medium" scope="col">
                Amount ({baseAsset})
              </th>
              <th className="px-4 text-right font-medium" scope="col">
                Total ({quoteAsset})
              </th>
            </tr>
          </thead>
          <tbody aria-label="Asks, sell orders">
            {preview.asks.map((level) => (
              <OrderBookLevelRow key={level.price} level={level} side="ask" />
            ))}
          </tbody>
          <tbody>
            <tr className="h-12 border-y border-border bg-surface-interactive">
              <th className="px-4 text-left" colSpan={3} scope="rowgroup">
                <span className="mr-2 text-xs font-medium text-foreground-muted">Mid price</span>
                <span className="font-mono text-base font-bold tabular-nums text-foreground">
                  {formatMarketPrice(midPrice)}
                </span>
              </th>
            </tr>
          </tbody>
          <tbody aria-label="Bids, buy orders">
            {preview.bids.map((level) => (
              <OrderBookLevelRow key={level.price} level={level} side="bid" />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
