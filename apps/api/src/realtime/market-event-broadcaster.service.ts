import type { CandleInterval, RealtimeChannel, SubscribeCommand } from "@pulse-trade/contracts";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import WebSocket from "ws";

import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type ProviderMarketEvent,
} from "../markets/provider/market-data-provider";
import { MarketCacheService } from "./market-cache.service";
import { MarketFreshnessService, type MarketFreshnessEvent } from "./freshness.service";
import { mapProviderEvent, type MarketRealtimeEvent } from "./provider-event.mapper";
import { SubscriptionRegistry, type SubscriptionQuery } from "./subscription-registry.service";

const CANDLE_INTERVALS: readonly CandleInterval[] = ["1m", "5m", "15m", "1h"];

@Injectable()
export class MarketEventBroadcaster implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketEventBroadcaster.name);
  private removeFreshnessListener: (() => void) | undefined;
  private removeProviderListener: (() => void) | undefined;

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
    private readonly marketCache: MarketCacheService,
    private readonly marketFreshness: MarketFreshnessService,
    private readonly subscriptionRegistry: SubscriptionRegistry,
  ) {}

  onModuleInit(): void {
    if (this.removeProviderListener) return;

    this.removeFreshnessListener = this.marketFreshness.onFreshnessEvent((event) =>
      this.broadcastFreshness(event),
    );
    this.removeProviderListener = this.provider.onEvent((event) => this.handleProviderEvent(event));
    void this.provider.connect().catch(() => {
      this.logger.warn("Initial market data connection failed; provider reconnect remains active");
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.removeProviderListener?.();
    this.removeProviderListener = undefined;
    this.removeFreshnessListener?.();
    this.removeFreshnessListener = undefined;

    try {
      await this.provider.close();
    } catch {
      this.logger.warn("Failed to close market data provider cleanly");
    }
  }

  broadcast(providerEvent: ProviderMarketEvent): void {
    const realtimeEvent = mapProviderEvent(providerEvent);
    const liveEvent = this.marketFreshness.recordMarketEvent(providerEvent);
    const subscribers = this.subscriptionRegistry.getSubscribers(
      toSubscriptionQuery(providerEvent),
    );
    this.send(realtimeEvent, subscribers);
    if (liveEvent) this.broadcastFreshness(liveEvent);
  }

  scheduleInitialState(client: WebSocket, command: SubscribeCommand): void {
    setImmediate(() => this.sendInitialState(client, command));
  }

  private handleProviderEvent(event: ProviderMarketEvent): void {
    try {
      this.broadcast(event);
    } catch {
      this.logger.warn("Ignored invalid normalized market event during broadcast");
    }
  }

  private broadcastFreshness(event: MarketFreshnessEvent): void {
    const subscribers = this.subscriptionRegistry.getSubscribersForSymbol(event.symbol);
    this.send(event, subscribers);
  }

  private send(
    event: MarketRealtimeEvent | MarketFreshnessEvent,
    clients: readonly WebSocket[],
  ): void {
    if (clients.length === 0) return;
    const payload = JSON.stringify(event);

    for (const client of clients) {
      if (client.readyState !== WebSocket.OPEN) continue;

      try {
        client.send(payload);
      } catch {
        this.logger.warn("Failed to send realtime market event to client");
      }
    }
  }

  private sendInitialState(client: WebSocket, command: SubscribeCommand): void {
    if (client.readyState !== WebSocket.OPEN) return;

    for (const symbol of new Set(command.symbols)) {
      for (const channel of new Set(command.channels)) {
        this.sendCachedChannelState(client, symbol, channel, command.options?.candleInterval);
      }

      if (this.subscriptionRegistry.getSubscribersForSymbol(symbol).includes(client)) {
        const freshnessEvent = this.marketFreshness.getCurrentEvent(symbol);
        if (freshnessEvent) this.send(freshnessEvent, [client]);
      }
    }
  }

  private sendCachedChannelState(
    client: WebSocket,
    symbol: string,
    channel: RealtimeChannel,
    candleInterval: CandleInterval | undefined,
  ): void {
    if (!this.isStillSubscribed(client, { candleInterval, channel, symbol })) return;

    switch (channel) {
      case "ticker": {
        const event = this.marketCache.getTicker(symbol);
        if (event) this.send(mapProviderEvent(event), [client]);
        break;
      }
      case "candles": {
        const intervals = candleInterval ? [candleInterval] : CANDLE_INTERVALS;
        for (const interval of intervals) {
          const event = this.marketCache.getCandle(symbol, interval);
          if (event) this.send(mapProviderEvent(event), [client]);
        }
        break;
      }
      case "orderbook": {
        const event = this.marketCache.getOrderBook(symbol);
        if (event) this.send(mapProviderEvent(event), [client]);
        break;
      }
      case "trades": {
        const event = this.marketCache.getTrades(symbol);
        if (event) this.send(mapProviderEvent(event), [client]);
        break;
      }
    }
  }

  private isStillSubscribed(client: WebSocket, query: SubscriptionQuery): boolean {
    return this.subscriptionRegistry.getSubscribers(query).includes(client);
  }
}

function toSubscriptionQuery(event: ProviderMarketEvent): SubscriptionQuery {
  switch (event.type) {
    case "ticker":
      return { channel: "ticker", symbol: event.symbol };
    case "candle.snapshot":
    case "candle.update":
      return { candleInterval: event.interval, channel: "candles", symbol: event.symbol };
    case "orderbook.snapshot":
    case "orderbook.update":
      return { channel: "orderbook", symbol: event.symbol };
    case "trades.batch":
      return { channel: "trades", symbol: event.symbol };
  }
}
