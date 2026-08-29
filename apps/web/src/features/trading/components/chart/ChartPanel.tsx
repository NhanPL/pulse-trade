import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h";

export type ChartPanelProps = {
  children?: ReactNode;
  symbol: string;
  timeframe?: ChartTimeframe;
};

function ChartPlaceholder() {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center">
      <div>
        <span
          aria-hidden="true"
          className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-surface-interactive text-brand"
        >
          <svg className="size-6" fill="none" viewBox="0 0 24 24">
            <path
              d="M6 5v14m-2-9h4v5H4v-5Zm6-7v18m-2-8h4v6h-4v-6Zm6-6v14m-2-8h4v5h-4v-5Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </span>
        <p className="mt-4 text-sm font-semibold text-foreground-secondary">Chart canvas</p>
        <p className="mt-1 text-xs text-foreground-muted">
          Historical and live candles will render here.
        </p>
      </div>
    </div>
  );
}

export function ChartPanel({ children, symbol, timeframe = "1m" }: ChartPanelProps) {
  return (
    <section
      aria-labelledby="chart-panel-title"
      className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5">
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
        className="relative h-80 min-w-0 overflow-hidden sm:h-[26rem] lg:h-[30rem]"
        data-chart-container={symbol}
        style={{
          backgroundImage:
            "linear-gradient(var(--pt-color-chart-grid) 1px, transparent 1px), linear-gradient(90deg, var(--pt-color-chart-grid) 1px, transparent 1px)",
          backgroundSize: "64px 48px",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 border-t border-dashed border-brand/15"
        />
        {children ?? <ChartPlaceholder />}
      </div>
    </section>
  );
}
