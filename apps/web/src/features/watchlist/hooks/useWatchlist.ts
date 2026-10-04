"use client";

import { useQuery } from "@tanstack/react-query";
import type { WatchlistListResponse } from "@pulse-trade/contracts";

import { useAuthSession } from "../../auth/components/AuthSessionProvider";
import { fetchWatchlist } from "../api/watchlist";
import { watchlistQueryKeys } from "../model/query-keys";

function useWatchlistQuery<T>(select: (data: WatchlistListResponse["data"]) => T) {
  const session = useAuthSession();
  return useQuery({
    enabled: session.status === "authenticated",
    queryKey: watchlistQueryKeys.list(session.user?.id ?? null),
    queryFn: ({ signal }) => fetchWatchlist(session.getAccessToken() ?? "", signal),
    select,
    retry: false,
    staleTime: 30_000,
  });
}

export function useWatchlist(symbol?: string) {
  // The page and stars share one request; a star observes only its own membership.
  return useWatchlistQuery((data) => data.items.some((item) => item.symbol === symbol));
}

export function useWatchlistItems() {
  return useWatchlistQuery((data) => data.items);
}
