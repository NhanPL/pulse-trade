"use client";

import { useTradingRealtimeSubscription } from "../hooks/useTradingRealtimeSubscription";

export type TradingRealtimeSubscriptionProps = Readonly<{
  symbol: string;
}>;

export function TradingRealtimeSubscription({ symbol }: TradingRealtimeSubscriptionProps) {
  useTradingRealtimeSubscription(symbol);
  return null;
}
