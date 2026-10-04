"use client";

import { useRef } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeResponse, WatchlistListResponse } from "@pulse-trade/contracts";

import { useAuthSession } from "../../auth/components/AuthSessionProvider";
import { authQueryKeys } from "../../auth/model/query-keys";
import { addWatchlistItem, removeWatchlistItem, WatchlistRequestError } from "../api/watchlist";
import { watchlistQueryKeys } from "../model/query-keys";
import { useWatchlist } from "./useWatchlist";

export function useWatchlistToggle(symbol: string) {
  const session = useAuthSession();
  const query = useWatchlist(symbol);
  const queryClient = useQueryClient();
  const submitting = useRef<string | null>(null);
  const userId = session.user?.id ?? null;
  const mutationKey = watchlistQueryKeys.toggle(userId, symbol);
  const mutationFilter = { mutationKey, exact: true };
  const isMutating = useIsMutating(mutationFilter) > 0;

  function stillOwnsSession(ownerId: string): boolean {
    return (
      !!session.getAccessToken() &&
      queryClient.getQueryData<MeResponse["data"]["user"]>(authQueryKeys.me)?.id === ownerId
    );
  }

  const mutation = useMutation({
    mutationKey,
    retry: false,
    // Feedback belongs to mounted controls, not the next login or account switch.
    gcTime: 0,
    mutationFn: async ({ saved, ownerId }: { saved: boolean; ownerId: string }) => {
      if (!stillOwnsSession(ownerId)) {
        throw new WatchlistRequestError(
          "UNAUTHENTICATED",
          "Your session has expired. Sign in again to continue.",
        );
      }
      const token = session.getAccessToken() ?? "";
      if (saved) {
        await removeWatchlistItem(token, symbol);
        return null;
      }
      return addWatchlistItem(token, symbol);
    },
    onSuccess: async (item, { ownerId }) => {
      const queryKey = watchlistQueryKeys.list(ownerId);
      await queryClient.cancelQueries({ queryKey, exact: true });
      // A late mutation must not recreate private cache after logout or update a different account.
      if (!stillOwnsSession(ownerId)) return;
      queryClient.setQueryData<WatchlistListResponse["data"]>(queryKey, (current) =>
        current
          ? {
              items: item
                ? [item, ...current.items.filter((saved) => saved.symbol !== symbol)]
                : current.items.filter((saved) => saved.symbol !== symbol),
            }
          : undefined,
      );
    },
    onSettled: async (_data, _error, { ownerId }) => {
      // A timeout can follow a committed write; reconcile from REST without pretending it succeeded.
      try {
        if (stillOwnsSession(ownerId))
          await queryClient.invalidateQueries({
            queryKey: watchlistQueryKeys.list(ownerId),
            exact: true,
          });
      } finally {
        if (submitting.current === ownerId) submitting.current = null;
      }
    },
  });

  return {
    saved: query.data === true,
    pending: isMutating,
    disabled:
      session.status !== "authenticated" ||
      session.isLoggingOut ||
      query.isPending ||
      query.isError ||
      isMutating,
    toggle() {
      if (
        session.status !== "authenticated" ||
        !userId ||
        session.isLoggingOut ||
        query.isPending ||
        query.isError ||
        submitting.current === userId ||
        queryClient.isMutating(mutationFilter) > 0
      )
        return;
      submitting.current = userId;
      mutation.mutate({ saved: query.data === true, ownerId: userId });
    },
  };
}
