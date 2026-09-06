import type { RealtimeChannel, SubscriptionOptions } from "@pulse-trade/contracts";

import { RealtimeClient } from "./RealtimeClient";

export type RealtimeSubscriptionRequest = Readonly<{
  channels: readonly RealtimeChannel[];
  options?: SubscriptionOptions;
  symbols: readonly string[];
}>;

export type RealtimeSubscriptionManagerOptions = Readonly<{
  createRequestId?: () => string;
}>;

type ManagedSubscription = {
  count: number;
  request: RealtimeSubscriptionRequest;
  sent: boolean;
};

const REALTIME_CHANNELS = new Set<RealtimeChannel>(["ticker", "candles", "orderbook", "trades"]);
const CANDLE_INTERVALS = new Set<NonNullable<SubscriptionOptions["candleInterval"]>>([
  "1m",
  "5m",
  "15m",
  "1h",
]);

export class RealtimeSubscriptionManager {
  private readonly createRequestId: () => string;
  private destroyed = false;
  private readonly removeConnectionStateListener: () => void;
  private readonly subscriptions = new Map<string, ManagedSubscription>();

  constructor(
    private readonly client: RealtimeClient,
    options: RealtimeSubscriptionManagerOptions = {},
  ) {
    this.createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
    this.removeConnectionStateListener = this.client.onConnectionState((state) => {
      if (state === "CONNECTED") this.flushPendingSubscriptions();
    });
  }

  get activeSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  subscribe(request: RealtimeSubscriptionRequest): () => void {
    if (this.destroyed) {
      throw new Error("Realtime subscription manager has been destroyed");
    }

    const normalizedRequest = normalizeSubscriptionRequest(request);
    const key = createSubscriptionKey(normalizedRequest);
    const existing = this.subscriptions.get(key);

    if (existing) {
      existing.count += 1;
      return this.createCleanup(key, existing);
    }

    const subscription: ManagedSubscription = {
      count: 1,
      request: normalizedRequest,
      sent: false,
    };
    this.subscriptions.set(key, subscription);
    this.client.connect();
    this.sendSubscribe(subscription);

    return this.createCleanup(key, subscription);
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.removeConnectionStateListener();

    for (const subscription of this.subscriptions.values()) {
      this.sendUnsubscribe(subscription);
    }
    this.subscriptions.clear();
  }

  private createCleanup(key: string, subscription: ManagedSubscription): () => void {
    let cleanedUp = false;

    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.unsubscribe(key, subscription);
    };
  }

  private flushPendingSubscriptions(): void {
    if (this.destroyed) return;

    for (const subscription of this.subscriptions.values()) {
      this.sendSubscribe(subscription);
    }
  }

  private sendSubscribe(subscription: ManagedSubscription): void {
    if (subscription.sent) return;

    const { channels, options, symbols } = subscription.request;
    const command = {
      action: "subscribe",
      channels,
      requestId: this.createRequestId(),
      symbols,
      ...(options ? { options } : {}),
    };

    if (this.client.send(JSON.stringify(command))) subscription.sent = true;
  }

  private sendUnsubscribe(subscription: ManagedSubscription): void {
    if (!subscription.sent) return;

    const { channels, symbols } = subscription.request;
    const command = {
      action: "unsubscribe",
      channels,
      requestId: this.createRequestId(),
      symbols,
    };

    this.client.send(JSON.stringify(command));
  }

  private unsubscribe(key: string, subscription: ManagedSubscription): void {
    const current = this.subscriptions.get(key);
    if (current !== subscription) return;

    subscription.count -= 1;
    if (subscription.count > 0) return;

    this.subscriptions.delete(key);
    this.sendUnsubscribe(subscription);
  }
}

function normalizeSubscriptionRequest(
  request: RealtimeSubscriptionRequest,
): RealtimeSubscriptionRequest {
  const channels = normalizeChannels(request.channels);
  const symbols = normalizeSymbols(request.symbols);
  const candleInterval = request.options?.candleInterval;

  if (candleInterval && !CANDLE_INTERVALS.has(candleInterval)) {
    throw new Error(`Unsupported candle interval: ${candleInterval}`);
  }
  if (candleInterval && !channels.includes("candles")) {
    throw new Error("A candle interval requires the candles channel");
  }

  return {
    channels,
    symbols,
    ...(candleInterval ? { options: { candleInterval } } : {}),
  };
}

function normalizeChannels(channels: readonly RealtimeChannel[]): readonly RealtimeChannel[] {
  if (channels.length === 0) throw new Error("At least one realtime channel is required");

  const normalizedChannels = [...new Set(channels)].sort();
  for (const channel of normalizedChannels) {
    if (!REALTIME_CHANNELS.has(channel))
      throw new Error(`Unsupported realtime channel: ${channel}`);
  }

  return normalizedChannels;
}

function normalizeSymbols(symbols: readonly string[]): readonly string[] {
  if (symbols.length === 0) throw new Error("At least one market symbol is required");

  const normalizedSymbols = [...new Set(symbols)].sort();
  for (const symbol of normalizedSymbols) {
    if (typeof symbol !== "string" || symbol.trim().length === 0) {
      throw new Error("Market symbols must be non-empty strings");
    }
  }

  return normalizedSymbols;
}

function createSubscriptionKey(request: RealtimeSubscriptionRequest): string {
  return JSON.stringify({
    channels: request.channels,
    candleInterval: request.options?.candleInterval ?? null,
    symbols: request.symbols,
  });
}
