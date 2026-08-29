"use client";

import { useState } from "react";

import { Input } from "@/components/ui/Input";

import type { MarketTableItem } from "../model/market-table";
import { filterMarkets } from "../utils/filter-markets";
import {
  isMarketSortOption,
  MARKET_SORT_OPTIONS,
  sortMarkets,
  type MarketSortOption,
} from "../utils/sort-markets";
import { MarketListState } from "./MarketListState";

type ReadyMarketOverviewProps = {
  markets: readonly MarketTableItem[];
  status?: "ready";
};

type LoadingMarketOverviewProps = {
  status: "loading";
};

type ErrorMarketOverviewProps = {
  errorMessage?: string;
  isRetrying?: boolean;
  onRetry: () => void;
  status: "error";
};

export type MarketOverviewProps =
  ReadyMarketOverviewProps | LoadingMarketOverviewProps | ErrorMarketOverviewProps;

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

export function MarketOverview(props: MarketOverviewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<MarketSortOption>("symbol-asc");
  const isReady = props.status === undefined || props.status === "ready";
  const markets = isReady ? props.markets : [];
  const filteredMarkets = filterMarkets(markets, searchTerm);
  const sortedMarkets = sortMarkets(filteredMarkets, sortOption);
  const trimmedSearchTerm = searchTerm.trim();
  const resultLabel =
    props.status === "loading"
      ? "Loading markets"
      : props.status === "error"
        ? "Markets unavailable"
        : `${sortedMarkets.length} ${sortedMarkets.length === 1 ? "market" : "markets"}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle bg-surface/35 px-5 py-4">
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <div className="w-full sm:w-80">
            <Input
              autoComplete="off"
              className="[&::-webkit-search-cancel-button]:appearance-none"
              disabled={!isReady}
              label="Search markets"
              leadingIcon={<SearchIcon />}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by symbol or asset"
              type="search"
              value={searchTerm}
              trailingElement={
                searchTerm && isReady ? (
                  <button
                    type="button"
                    aria-label="Clear market search"
                    className="grid size-7 place-items-center rounded-md text-foreground-muted hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    onClick={() => setSearchTerm("")}
                  >
                    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
                      <path
                        d="m7 7 10 10M17 7 7 17"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.75"
                      />
                    </svg>
                  </button>
                ) : undefined
              }
            />
          </div>
          <label className="grid w-full gap-1.5 text-sm font-medium text-foreground sm:w-56">
            Sort by
            <span className="relative">
              <select
                className="h-11 w-full appearance-none rounded-lg border border-border bg-surface-interactive px-3 pr-9 text-sm text-foreground outline-none transition-colors hover:border-border-strong focus:border-brand focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-disabled disabled:opacity-70"
                disabled={!isReady}
                onChange={(event) => {
                  if (isMarketSortOption(event.target.value)) {
                    setSortOption(event.target.value);
                  }
                }}
                value={sortOption}
              >
                {MARKET_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="m7 10 5 5 5-5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                />
              </svg>
            </span>
          </label>
        </div>
        <p aria-live="polite" className="pb-3 text-xs text-foreground-muted">
          {resultLabel}
        </p>
      </div>
      {props.status === "loading" ? <MarketListState status="loading" /> : null}
      {props.status === "error" ? (
        <MarketListState
          description={props.errorMessage}
          isRetrying={props.isRetrying}
          onRetry={props.onRetry}
          status="error"
        />
      ) : null}
      {isReady ? (
        <MarketListState markets={sortedMarkets} searchTerm={trimmedSearchTerm} status="ready" />
      ) : null}
    </>
  );
}
