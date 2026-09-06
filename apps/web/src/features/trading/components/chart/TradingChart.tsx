"use client";

import { useState } from "react";

import { TradingRealtimeSubscription } from "../TradingRealtimeSubscription";
import { ChartPanel, type ChartTimeframe } from "./ChartPanel";

export type TradingChartProps = Readonly<{
  symbol: string;
}>;

export function TradingChart({ symbol }: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1m");

  return (
    <>
      <TradingRealtimeSubscription candleInterval={timeframe} symbol={symbol} />
      <ChartPanel onTimeframeChange={setTimeframe} symbol={symbol} timeframe={timeframe} />
    </>
  );
}
