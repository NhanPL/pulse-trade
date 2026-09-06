"use client";

import type { CandleInterval } from "@pulse-trade/contracts";

import { useTradingRealtimeSubscription } from "../hooks/useTradingRealtimeSubscription";

export type TradingRealtimeSubscriptionProps = Readonly<{
  candleInterval: CandleInterval;
  symbol: string;
}>;

export function TradingRealtimeSubscription({
  candleInterval,
  symbol,
}: TradingRealtimeSubscriptionProps) {
  useTradingRealtimeSubscription(symbol, candleInterval);
  return null;
}
