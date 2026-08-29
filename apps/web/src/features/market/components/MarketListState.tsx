import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

import type { MarketTableItem } from "../model/market-table";
import { MarketTable } from "./MarketTable";
import { MarketTableSkeleton } from "./MarketTableSkeleton";

type ReadyMarketListState = {
  markets: readonly MarketTableItem[];
  searchTerm: string;
  status: "ready";
};

type LoadingMarketListState = {
  status: "loading";
};

type ErrorMarketListState = {
  description?: string;
  isRetrying?: boolean;
  onRetry: () => void;
  status: "error";
};

export type MarketListStateProps =
  ReadyMarketListState | LoadingMarketListState | ErrorMarketListState;

export function MarketListState(props: MarketListStateProps) {
  if (props.status === "loading") {
    return <MarketTableSkeleton />;
  }

  if (props.status === "error") {
    return (
      <ErrorState
        className="rounded-none border-0 bg-transparent"
        description={
          props.description ?? "Check your connection, then try loading the market list again."
        }
        isRetrying={props.isRetrying}
        onRetry={props.onRetry}
        size="compact"
        title="Markets are unavailable"
      />
    );
  }

  if (props.markets.length === 0) {
    const query = props.searchTerm.trim();

    return (
      <EmptyState
        className="rounded-none border-0 bg-transparent"
        description={query ? "Try another symbol or asset name." : "Try again in a moment."}
        size="compact"
        title={query ? `No markets match “${query}”.` : "No markets available."}
      />
    );
  }

  return <MarketTable markets={props.markets} />;
}
