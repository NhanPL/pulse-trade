"use client";

import { useEffect } from "react";

import { getBrowserRealtimeRuntime } from "../../../lib/realtime/realtime-runtime";
import type { RealtimeSubscriptionManager } from "../../../lib/realtime/subscription-manager";
import {
  acquireRealtimeStoreBindings,
  type RealtimeStoreBindingRuntime,
} from "../../realtime/realtime-store-bindings";

type WatchlistRealtimeRuntime = RealtimeStoreBindingRuntime & {
  subscriptions: Pick<RealtimeSubscriptionManager, "subscribe">;
};

export function useWatchlistRealtime(symbols: readonly string[]): void {
  const symbolKey = [...new Set(symbols)].sort().join("|");
  // Refetching the same REST list must not unsubscribe/resubscribe an unchanged stream.
  useEffect(
    () =>
      symbolKey
        ? subscribeToWatchlistTickers(getBrowserRealtimeRuntime(), symbolKey.split("|"))
        : undefined,
    [symbolKey],
  );
}

export function subscribeToWatchlistTickers(
  runtime: WatchlistRealtimeRuntime,
  symbols: readonly string[],
): () => void {
  const normalized = [...new Set(symbols)].sort();
  if (normalized.length === 0) return () => undefined;
  const releaseBindings = acquireRealtimeStoreBindings(runtime);
  let releaseSubscription: () => void;
  try {
    releaseSubscription = runtime.subscriptions.subscribe({
      channels: ["ticker"],
      symbols: normalized,
    });
  } catch (error) {
    releaseBindings();
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseSubscription();
    releaseBindings();
  };
}
