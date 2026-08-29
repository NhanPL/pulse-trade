"use client";

import { memo } from "react";

import { formatMarketPrice } from "../utils/format-market-value";

export type LiveMarketPriceProps = {
  price: string;
  symbol: string;
};

// This boundary can subscribe to one symbol when the ticker store lands without coupling the row
// to the realtime client or causing unrelated prices to render again.
export const LiveMarketPrice = memo(function LiveMarketPrice({
  price,
  symbol,
}: LiveMarketPriceProps) {
  return (
    <span data-market-price={symbol} className="font-mono font-semibold tabular-nums">
      {formatMarketPrice(price)}
    </span>
  );
});
