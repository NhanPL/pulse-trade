"use client";

import type { ReactNode } from "react";

import type { CandleInterval } from "@pulse-trade/contracts";

import { CandlestickChart } from "./CandlestickChart";
import { ChartTimeframeTabs } from "./ChartTimeframeTabs";

export type ChartTimeframe = CandleInterval;

export type ChartPanelProps = {
  children?: ReactNode;
  onTimeframeChange: (timeframe: ChartTimeframe) => void;
  symbol: string;
  timeframe: ChartTimeframe;
};

export function ChartPanel({ children, onTimeframeChange, symbol, timeframe }: ChartPanelProps) {
  return (
    <section
      aria-labelledby="chart-panel-title"
      className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5 lg:min-h-12 lg:py-2">
        <div className="min-w-0">
          <h2 id="chart-panel-title" className="text-sm font-semibold text-foreground">
            Candlestick chart
          </h2>
          <p className="mt-0.5 truncate font-mono text-xs text-foreground-muted">{symbol}</p>
        </div>
        <ChartTimeframeTabs onTimeframeChange={onTimeframeChange} timeframe={timeframe} />
      </header>

      <div
        className="relative h-80 min-w-0 overflow-hidden sm:h-[26rem] lg:h-auto lg:min-h-0 lg:flex-1"
        data-chart-container={symbol}
      >
        {children ?? <CandlestickChart symbol={symbol} timeframe={timeframe} />}
      </div>
    </section>
  );
}
