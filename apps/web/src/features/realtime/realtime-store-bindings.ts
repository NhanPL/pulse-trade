import {
  bindConnectionStateStore,
  type RealtimeConnectionStateSource,
} from "./stores/connection-state-store";
import { bindCandleStore } from "./stores/candle-store";
import { bindOrderBookStore } from "./stores/order-book-store";
import { bindRecentTradesStore } from "./stores/recent-trades-store";
import { bindTickerStore, type RealtimeEventSource } from "./stores/ticker-store";

export type RealtimeStoreBindingRuntime = Readonly<{
  client: RealtimeConnectionStateSource;
  eventRouter: RealtimeEventSource;
}>;

type ActiveStoreBindings = {
  count: number;
  release: () => void;
};

const activeBindingsByRuntime = new WeakMap<RealtimeStoreBindingRuntime, ActiveStoreBindings>();

export function acquireRealtimeStoreBindings(runtime: RealtimeStoreBindingRuntime): () => void {
  const existingBindings = activeBindingsByRuntime.get(runtime);
  if (existingBindings) {
    existingBindings.count += 1;
    return createRelease(runtime, existingBindings);
  }

  const releaseConnectionState = bindConnectionStateStore(runtime.client);
  const releaseCandles = bindCandleStore(runtime.eventRouter);
  const releaseTicker = bindTickerStore(runtime.eventRouter);
  const releaseOrderBook = bindOrderBookStore(runtime.eventRouter);
  const releaseRecentTrades = bindRecentTradesStore(runtime.eventRouter);
  const bindings: ActiveStoreBindings = {
    count: 1,
    release: () => {
      releaseRecentTrades();
      releaseOrderBook();
      releaseTicker();
      releaseCandles();
      releaseConnectionState();
    },
  };
  activeBindingsByRuntime.set(runtime, bindings);

  return createRelease(runtime, bindings);
}

function createRelease(
  runtime: RealtimeStoreBindingRuntime,
  bindings: ActiveStoreBindings,
): () => void {
  let released = false;

  return () => {
    if (released) return;
    released = true;

    bindings.count -= 1;
    if (bindings.count !== 0) return;

    activeBindingsByRuntime.delete(runtime);
    bindings.release();
  };
}
