"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutationState } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { useAuthSession } from "@/features/auth/components/AuthSessionProvider";
import { safeReturnTo } from "@/features/auth/model/return-to";
import { WatchlistRequestError } from "../api/watchlist";
import { useWatchlist } from "../hooks/useWatchlist";
import { watchlistQueryKeys } from "../model/query-keys";

export function WatchlistStatus({ returnTo = "/" }: { returnTo?: string }) {
  const session = useAuthSession();
  const query = useWatchlist();
  const [dismissedError, setDismissedError] = useState<unknown>(null);
  const mutations = useMutationState({
    filters: { mutationKey: watchlistQueryKeys.mutations(session.user?.id ?? null) },
    select: (mutation) => ({ status: mutation.state.status, error: mutation.state.error }),
  });
  const latest = mutations.at(-1);
  const mutationError =
    latest?.status === "error" && latest.error !== dismissedError ? latest.error : null;
  const error = query.error ?? mutationError;

  if (session.status === "unauthenticated" || session.status === "checking") return null;
  if (session.status === "authenticated" && !error && !query.isPending) return null;
  const expired = error instanceof WatchlistRequestError && error.code === "UNAUTHENTICATED";
  const message =
    session.status === "unavailable"
      ? "We couldn't check your session. Retry to use your watchlist."
      : error instanceof WatchlistRequestError
        ? error.message
        : error
          ? "Your watchlist is temporarily unavailable. Please try again."
          : "Loading your watchlist…";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3 text-sm">
      <p
        className={
          error || session.status === "unavailable" ? "text-warning" : "text-foreground-muted"
        }
        role={error || session.status === "unavailable" ? "alert" : "status"}
      >
        {message}
      </p>
      {expired ? (
        <Link
          className="rounded text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          href={`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}
        >
          Sign in again
        </Link>
      ) : session.status === "unavailable" ? (
        <Button onClick={() => session.retry()} size="sm" variant="secondary">
          Retry session
        </Button>
      ) : error ? (
        <Button
          isLoading={query.isFetching}
          onClick={async () => {
            const result = await query.refetch();
            if (!result.isError) setDismissedError(mutationError);
          }}
          size="sm"
          variant="secondary"
        >
          Refresh watchlist
        </Button>
      ) : null}
    </div>
  );
}
