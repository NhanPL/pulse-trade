import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

import type { ChartDataState as ChartDataStatus } from "./chart-data-state";

export type ChartDataStateProps = Readonly<{
  isRetrying: boolean;
  onRetry: () => void;
  status: Exclude<ChartDataStatus, "ready">;
  symbol: string;
}>;

export function ChartDataState({ isRetrying, onRetry, status, symbol }: ChartDataStateProps) {
  if (status === "loading") return <ChartLoadingState symbol={symbol} />;

  if (status === "error") {
    return (
      <ErrorState
        className="absolute inset-0 rounded-none border-0 bg-surface-elevated/95"
        description="Check your connection, then try loading chart history again."
        isRetrying={isRetrying}
        onRetry={onRetry}
        retryLabel="Retry chart"
        size="compact"
        title="Chart history is unavailable"
      />
    );
  }

  return (
    <EmptyState
      className="absolute inset-0 rounded-none border-0 bg-surface-elevated/95"
      description="There are no historical candles available for this market and timeframe yet."
      size="compact"
      title="No chart data available"
    />
  );
}

function ChartLoadingState({ symbol }: Readonly<{ symbol: string }>) {
  return (
    <div
      aria-label={`Loading ${symbol} chart history`}
      aria-live="polite"
      className="absolute inset-0 grid grid-cols-[1fr_4.5rem] gap-3 p-4 sm:p-5"
      role="status"
    >
      <span className="sr-only">Loading {symbol} chart history</span>
      <div aria-hidden="true" className="flex min-w-0 flex-col justify-between gap-5 py-2">
        <Skeleton className="h-3 max-w-28" variant="text" />
        <Skeleton className="h-3 max-w-20 self-end" variant="text" />
        <Skeleton className="h-3 max-w-36" variant="text" />
        <Skeleton className="h-3 max-w-24 self-end" variant="text" />
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col justify-between gap-5 border-l border-border-subtle pl-3 py-2"
      >
        <Skeleton className="h-3" variant="text" />
        <Skeleton className="h-3 max-w-10 self-end" variant="text" />
        <Skeleton className="h-3 max-w-8 self-end" variant="text" />
        <Skeleton className="h-3 max-w-12 self-end" variant="text" />
      </div>
    </div>
  );
}
