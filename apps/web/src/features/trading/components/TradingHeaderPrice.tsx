"use client";

import { memo } from "react";

import { formatMarketPrice } from "@/lib/format/market-value";

export type TradingHeaderPriceProps = {
  price: string;
  symbol: string;
};

// The realtime store can update this narrow boundary without rendering identity or 24h labels.
export const TradingHeaderPrice = memo(function TradingHeaderPrice({
  price,
  symbol,
}: TradingHeaderPriceProps) {
  return (
    <span
      className="font-mono text-3xl font-bold tracking-tight tabular-nums text-foreground sm:text-4xl"
      data-trading-price={symbol}
    >
      {formatMarketPrice(price)}
    </span>
  );
});
