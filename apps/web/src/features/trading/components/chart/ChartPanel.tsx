import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";

import { CandlestickChart } from "./CandlestickChart";

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h";

export type ChartPanelProps = {
  children?: ReactNode;
  symbol: string;
  timeframe?: ChartTimeframe;
};

export function ChartPanel({ children, symbol, timeframe = "1m" }: ChartPanelProps) {
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
        <Badge aria-label={`Current chart timeframe: ${timeframe}`} variant="neutral">
          {timeframe}
        </Badge>
      </header>

      <div
        className="relative h-80 min-w-0 overflow-hidden sm:h-[26rem] lg:h-auto lg:min-h-0 lg:flex-1"
        data-chart-container={symbol}
      >
        {children ?? <CandlestickChart symbol={symbol} />}
      </div>
    </section>
  );
}
