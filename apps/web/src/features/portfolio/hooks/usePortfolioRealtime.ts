import { useEffect } from "react";

import { getBrowserRealtimeRuntime } from "../../../lib/realtime/realtime-runtime";
import type { RealtimeSubscriptionManager } from "../../../lib/realtime/subscription-manager";
import {
  acquireRealtimeStoreBindings,
  type RealtimeStoreBindingRuntime,
} from "../../realtime/realtime-store-bindings";

export type PortfolioRealtimeRuntime = RealtimeStoreBindingRuntime &
  Readonly<{
    subscriptions: Pick<RealtimeSubscriptionManager, "subscribe">;
  }>;

export function usePortfolioRealtime(symbols: readonly string[]): void {
  useEffect(() => subscribeToPortfolioTickers(getBrowserRealtimeRuntime(), symbols), [symbols]);
}

export function subscribeToPortfolioTickers(
  runtime: PortfolioRealtimeRuntime,
  symbols: readonly string[],
): () => void {
  const normalizedSymbols = [...new Set(symbols)].sort();
  if (normalizedSymbols.length === 0) return () => undefined;

  const releaseStoreBindings = acquireRealtimeStoreBindings(runtime);
  let releaseSubscription: () => void;

  try {
    releaseSubscription = runtime.subscriptions.subscribe({
      channels: ["ticker"],
      symbols: normalizedSymbols,
    });
  } catch (error) {
    releaseStoreBindings();
    throw error;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseSubscription();
    releaseStoreBindings();
  };
}
