"use client";

import { classNames } from "@/components/ui/class-names";

import type { ChartTimeframe } from "./ChartPanel";

export const CHART_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "1h",
] as const satisfies readonly ChartTimeframe[];

export type ChartTimeframeTabsProps = Readonly<{
  onTimeframeChange: (timeframe: ChartTimeframe) => void;
  timeframe: ChartTimeframe;
}>;

export function ChartTimeframeTabs({ onTimeframeChange, timeframe }: ChartTimeframeTabsProps) {
  return (
    <div
      aria-label="Chart timeframe"
      className="flex shrink-0 gap-1 rounded-lg border border-border bg-surface p-1"
      role="group"
    >
      {CHART_TIMEFRAMES.map((option) => {
        const selected = option === timeframe;

        return (
          <button
            aria-pressed={selected}
            className={classNames(
              "inline-flex min-h-8 items-center justify-center rounded-md px-2.5 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              selected
                ? "bg-surface-selected text-brand"
                : "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
            )}
            key={option}
            onClick={() => onTimeframeChange(option)}
            type="button"
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
