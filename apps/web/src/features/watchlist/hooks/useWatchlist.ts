"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuthSession } from "../../auth/components/AuthSessionProvider";
import { fetchWatchlist } from "../api/watchlist";
import { watchlistQueryKeys } from "../model/query-keys";

export function useWatchlist(symbol?: string) {
  const session = useAuthSession();
  return useQuery({
    enabled: session.status === "authenticated",
    queryKey: watchlistQueryKeys.list(session.user?.id ?? null),
    queryFn: ({ signal }) => fetchWatchlist(session.getAccessToken() ?? "", signal),
    // All stars share one request; each observes only its own membership, never market ticks.
    select: (data) => data.items.some((item) => item.symbol === symbol),
    retry: false,
    staleTime: 30_000,
  });
}
