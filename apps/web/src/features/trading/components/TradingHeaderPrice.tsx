"use client";

import { memo } from "react";

import { formatMarketPrice } from "@/lib/format/market-value";
import { useTicker } from "@/features/realtime/stores/ticker-store";

export type TradingHeaderPriceProps = {
  price: string;
  symbol: string;
};

// The realtime store can update this narrow boundary without rendering identity or 24h labels.
export const TradingHeaderPrice = memo(function TradingHeaderPrice({
  price,
  symbol,
}: TradingHeaderPriceProps) {
  const ticker = useTicker(symbol);

  return (
    <span
      className="font-mono text-3xl font-bold tracking-tight tabular-nums text-foreground sm:text-4xl"
      data-trading-price={symbol}
    >
      {formatMarketPrice(ticker?.price ?? price)}
    </span>
  );
});
