import {
  watchlistAddRequestSchema,
  watchlistAddResponseSchema,
  watchlistListResponseSchema,
  watchlistRemoveParamsSchema,
  type WatchlistItem,
  type WatchlistListResponse,
} from "@pulse-trade/contracts";
import { z } from "zod";

import { webEnvironment } from "../../../lib/env/server";

const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });
const unavailableMessage =
  "We couldn't confirm this watchlist change. Refresh your watchlist before trying again.";

export class WatchlistRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WatchlistRequestError";
  }
}

export async function fetchWatchlist(
  accessToken: string,
  signal?: AbortSignal,
): Promise<WatchlistListResponse["data"]> {
  const response = await requestWatchlist(accessToken, "", { method: "GET" }, signal);
  const result = watchlistListResponseSchema.safeParse(await response.json().catch(() => null));
  if (!result.success)
    throw new WatchlistRequestError(
      "WATCHLIST_UNAVAILABLE",
      "We couldn't verify your watchlist. Please try again.",
    );
  return result.data.data;
}

export async function addWatchlistItem(
  accessToken: string,
  symbol: string,
): Promise<WatchlistItem> {
  const body = watchlistAddRequestSchema.safeParse({ symbol });
  if (!body.success)
    throw new WatchlistRequestError("INVALID_WATCHLIST_REQUEST", "This market symbol is invalid.");
  const response = await requestWatchlist(accessToken, "", {
    method: "POST",
    body: JSON.stringify(body.data),
    headers: { "Content-Type": "application/json" },
  });
  const result = watchlistAddResponseSchema.safeParse(await response.json().catch(() => null));
  if (!result.success || result.data.data.symbol !== symbol)
    throw new WatchlistRequestError("WATCHLIST_UNAVAILABLE", unavailableMessage);
  return result.data.data;
}

export async function removeWatchlistItem(accessToken: string, symbol: string): Promise<void> {
  if (!watchlistRemoveParamsSchema.safeParse({ symbol }).success)
    throw new WatchlistRequestError("INVALID_WATCHLIST_REQUEST", "This market symbol is invalid.");
  const response = await requestWatchlist(accessToken, `/${encodeURIComponent(symbol)}`, {
    method: "DELETE",
  });
  if (response.status !== 204)
    throw new WatchlistRequestError("WATCHLIST_UNAVAILABLE", unavailableMessage);
}

async function requestWatchlist(
  accessToken: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  if (!accessToken)
    throw new WatchlistRequestError(
      "UNAUTHENTICATED",
      "Your session has expired. Sign in again to continue.",
    );
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(15_000);
    response = await fetch(
      `${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/watchlist${path}`,
      {
        ...init,
        cache: "no-store",
        credentials: "include",
        headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new WatchlistRequestError(
      "WATCHLIST_UNAVAILABLE",
      init.method === "GET"
        ? "We couldn't load your watchlist. Check your connection and try again."
        : unavailableMessage,
    );
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const result = errorResponseSchema.safeParse(body);
    const code =
      response.status === 401
        ? "UNAUTHENTICATED"
        : result.success
          ? result.data.error.code
          : "WATCHLIST_UNAVAILABLE";
    const message =
      code === "UNAUTHENTICATED"
        ? "Your session has expired. Sign in again to continue."
        : code === "UNSUPPORTED_SYMBOL"
          ? "This market is not supported by your watchlist."
          : "Your watchlist is temporarily unavailable. Please try again.";
    throw new WatchlistRequestError(code, message);
  }
  return response;
}
