import { useStore } from "zustand";

import { tickerStore } from "@/features/realtime/stores/ticker-store";
import { formatMarketPrice } from "@/lib/format/market-value";

type OrderBookMidPriceProps = {
  bestAsk?: string;
  bestBid?: string;
  hasBook: boolean;
  midPrice: string;
  presentedPrice?: string;
  symbol: string;
};

export function OrderBookMidPrice({
  bestAsk,
  bestBid,
  hasBook,
  midPrice,
  presentedPrice,
  symbol,
}: OrderBookMidPriceProps) {
  // Before the first snapshot, preserve the live price without waking the static preview rows.
  const bootstrapPrice = useStore(tickerStore, (state) =>
    hasBook ? undefined : state.tickers[symbol]?.price,
  );
  const price = presentedPrice ?? bootstrapPrice ?? midPrice;
  const spread = Number(bestAsk ?? price) - Number(bestBid ?? price);
  const numericPrice = Number(price);
  const spreadPercent = numericPrice === 0 ? 0 : (spread / numericPrice) * 100;

  return (
    <tr className="h-12 border-y border-border bg-surface-interactive lg:h-10">
      <th className="px-4 text-left" colSpan={2} scope="rowgroup">
        <span className="font-mono text-lg font-bold tabular-nums text-positive">
          {formatMarketPrice(price)} <span aria-hidden="true">↑</span>
        </span>
      </th>
      <td className="px-4 text-right text-[0.6875rem] text-foreground-muted">
        <span className="mr-1">Spread</span>
        <span className="font-mono tabular-nums text-foreground-secondary">
          {formatMarketPrice(String(spread))} ({spreadPercent.toFixed(2)}%)
        </span>
      </td>
    </tr>
  );
}
