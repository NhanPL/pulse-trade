import {
  marketLiveEventSchema,
  marketStaleEventSchema,
  REALTIME_PROTOCOL_VERSION,
  type MarketLiveEvent,
  type MarketStaleEvent,
} from "@pulse-trade/contracts";
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type ProviderConnectionStateEvent,
  type ProviderMarketEvent,
} from "../markets/provider/market-data-provider";
import { SubscriptionRegistry } from "./subscription-registry.service";

export const MARKET_FRESHNESS_OPTIONS = Symbol("MARKET_FRESHNESS_OPTIONS");
export const MARKET_STALE_AFTER_MS = 15_000;
export const MARKET_FRESHNESS_CHECK_INTERVAL_MS = 1_000;

export type MarketFreshnessEvent = MarketLiveEvent | MarketStaleEvent;

export type MarketFreshnessOptions = Readonly<{
  checkIntervalMs?: number;
  now?: () => number;
  staleAfterMs?: number;
}>;

type SymbolFreshness = Readonly<{
  lastUpdateTs: number;
  status: "LIVE" | "STALE";
}>;

type FreshnessListener = (event: MarketFreshnessEvent) => void;

@Injectable()
export class MarketFreshnessService implements OnModuleInit, OnModuleDestroy {
  private readonly checkIntervalMs: number;
  private readonly freshnessBySymbol = new Map<string, SymbolFreshness>();
  private readonly listeners = new Set<FreshnessListener>();
  private readonly logger = new Logger(MarketFreshnessService.name);
  private readonly now: () => number;
  private readonly staleAfterMs: number;
  private connectedAtTs = 0;
  private freshnessTimer: ReturnType<typeof setInterval> | undefined;
  private providerConnected = false;
  private removeConnectionStateListener: (() => void) | undefined;

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
    private readonly subscriptionRegistry: SubscriptionRegistry,
    @Optional()
    @Inject(MARKET_FRESHNESS_OPTIONS)
    options: MarketFreshnessOptions = {},
  ) {
    this.checkIntervalMs = options.checkIntervalMs ?? MARKET_FRESHNESS_CHECK_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.staleAfterMs = options.staleAfterMs ?? MARKET_STALE_AFTER_MS;

    validatePositiveDuration(this.checkIntervalMs, "freshness check interval");
    validatePositiveDuration(this.staleAfterMs, "market stale threshold");
  }

  onModuleInit(): void {
    if (this.removeConnectionStateListener) return;

    this.removeConnectionStateListener = this.provider.onConnectionState((event) =>
      this.handleConnectionState(event),
    );
    this.freshnessTimer = setInterval(() => this.checkForStaleMarkets(), this.checkIntervalMs);
    this.freshnessTimer.unref();
  }

  onModuleDestroy(): void {
    this.removeConnectionStateListener?.();
    this.removeConnectionStateListener = undefined;

    if (this.freshnessTimer) clearInterval(this.freshnessTimer);
    this.freshnessTimer = undefined;
  }

  onFreshnessEvent(listener: FreshnessListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recordMarketEvent(event: ProviderMarketEvent): MarketLiveEvent | undefined {
    const lastUpdateTs = this.now();
    const previousFreshness = this.freshnessBySymbol.get(event.symbol);

    if (!this.providerConnected) {
      this.freshnessBySymbol.set(event.symbol, { lastUpdateTs, status: "STALE" });
      return undefined;
    }

    this.freshnessBySymbol.set(event.symbol, { lastUpdateTs, status: "LIVE" });
    return previousFreshness?.status === "LIVE"
      ? undefined
      : createMarketLiveEvent(event.symbol, lastUpdateTs);
  }

  getCurrentEvent(symbol: string): MarketFreshnessEvent | undefined {
    const freshness = this.freshnessBySymbol.get(symbol);
    const now = this.now();

    if (!this.providerConnected) {
      return createMarketStaleEvent(symbol, freshness?.lastUpdateTs ?? 0, now);
    }

    if (!freshness) {
      return now - this.connectedAtTs >= this.staleAfterMs
        ? createMarketStaleEvent(symbol, 0, now)
        : undefined;
    }

    if (freshness.status === "STALE" || now - freshness.lastUpdateTs >= this.staleAfterMs) {
      return createMarketStaleEvent(symbol, freshness.lastUpdateTs, now);
    }

    return createMarketLiveEvent(symbol, now);
  }

  private checkForStaleMarkets(): void {
    if (!this.providerConnected) return;

    const now = this.now();
    for (const symbol of this.subscriptionRegistry.getSubscribedSymbols()) {
      const freshness = this.freshnessBySymbol.get(symbol);
      const lastUpdateTs = freshness?.lastUpdateTs ?? 0;
      const freshnessBaseline = freshness?.lastUpdateTs ?? this.connectedAtTs;

      if (freshness?.status !== "STALE" && now - freshnessBaseline >= this.staleAfterMs) {
        this.freshnessBySymbol.set(symbol, { lastUpdateTs, status: "STALE" });
        this.emit(createMarketStaleEvent(symbol, lastUpdateTs, now));
      }
    }
  }

  private emit(event: MarketFreshnessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown listener error";
        this.logger.error(`Market freshness listener failed: ${message}`);
      }
    }
  }

  private handleConnectionState(event: ProviderConnectionStateEvent): void {
    this.providerConnected = event.state === "CONNECTED";

    if (this.providerConnected) {
      this.connectedAtTs = event.ts;
      return;
    }

    const now = this.now();
    for (const symbol of this.subscriptionRegistry.getSubscribedSymbols()) {
      const freshness = this.freshnessBySymbol.get(symbol);
      if (freshness?.status === "STALE") continue;

      const lastUpdateTs = freshness?.lastUpdateTs ?? 0;
      this.freshnessBySymbol.set(symbol, { lastUpdateTs, status: "STALE" });
      this.emit(createMarketStaleEvent(symbol, lastUpdateTs, now));
    }
  }
}

function createMarketLiveEvent(symbol: string, ts: number): MarketLiveEvent {
  return marketLiveEventSchema.parse({
    data: {},
    event: "market.live",
    symbol,
    ts,
    v: REALTIME_PROTOCOL_VERSION,
  });
}

function createMarketStaleEvent(
  symbol: string,
  lastUpdateTs: number,
  ts: number,
): MarketStaleEvent {
  return marketStaleEventSchema.parse({
    data: { lastUpdateTs, reason: "UPSTREAM_DISCONNECTED" },
    event: "market.stale",
    symbol,
    ts,
    v: REALTIME_PROTOCOL_VERSION,
  });
}

function validatePositiveDuration(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}
