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
  const bestAsk = Number(preview.asks[0]?.price);
  const bestBid = Number(preview.bids[0]?.price);
  const spread = bestAsk - bestBid;
  const spreadPercent = (spread / Number(midPrice)) * 100;

  return (
    <section
      aria-labelledby="order-book-title"
      className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-14 items-center border-b border-border-subtle px-4 py-3 sm:px-5 lg:min-h-12 lg:py-2">
        <h2 id="order-book-title" className="text-sm font-semibold text-foreground">
          Order book
        </h2>
      </header>

      <div className="max-h-[32rem] overflow-y-auto lg:min-h-0 lg:flex-1">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            Static {symbol} order-book preview with sell orders above the mid-price and buy orders
            below it
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
                Total ({baseAsset})
              </th>
            </tr>
          </thead>
          <tbody aria-label="Asks, sell orders" className="bg-negative-subtle/40">
            {preview.asks.toReversed().map((level) => (
              <OrderBookLevelRow key={level.price} level={level} side="ask" />
            ))}
          </tbody>
          <tbody>
            <tr className="h-12 border-y border-border bg-surface-interactive lg:h-10">
              <th className="px-4 text-left" colSpan={2} scope="rowgroup">
                <span className="font-mono text-lg font-bold tabular-nums text-positive">
                  {formatMarketPrice(midPrice)} <span aria-hidden="true">↑</span>
                </span>
              </th>
              <td className="px-4 text-right text-[0.6875rem] text-foreground-muted">
                <span className="mr-1">Spread</span>
                <span className="font-mono tabular-nums text-foreground-secondary">
                  {formatMarketPrice(String(spread))} ({spreadPercent.toFixed(2)}%)
                </span>
              </td>
            </tr>
          </tbody>
          <tbody aria-label="Bids, buy orders" className="bg-positive-subtle/40">
            {preview.bids.map((level) => (
              <OrderBookLevelRow key={level.price} level={level} side="bid" />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
