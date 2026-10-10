import type { CandleInterval, RealtimeChannel, SubscribeCommand } from "@pulse-trade/contracts";
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import WebSocket from "ws";

import { BackendLogger } from "../observability/backend-logger";

import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type ProviderMarketEvent,
} from "../markets/provider/market-data-provider";
import { CandleAggregationService } from "./candle-aggregation.service";
import { MarketCacheService } from "./market-cache.service";
import { MarketFreshnessService, type MarketFreshnessEvent } from "./freshness.service";
import { mapProviderEvent, type MarketRealtimeEvent } from "./provider-event.mapper";
import { SubscriptionRegistry, type SubscriptionQuery } from "./subscription-registry.service";

const CANDLE_INTERVALS: readonly CandleInterval[] = ["1m", "5m", "15m", "1h"];

@Injectable()
export class MarketEventBroadcaster implements OnModuleInit, OnModuleDestroy {
  private readonly bootstrappedCandleKeys = new Set<string>();
  private readonly candleBootstrapRequests = new Map<string, Promise<void>>();
  private readonly logger = new BackendLogger("MarketEventBroadcaster");
  private removeFreshnessListener: (() => void) | undefined;
  private removeProviderListener: (() => void) | undefined;

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
    private readonly marketCache: MarketCacheService,
    private readonly candleAggregation: CandleAggregationService,
    private readonly marketFreshness: MarketFreshnessService,
    private readonly subscriptionRegistry: SubscriptionRegistry,
  ) {}

  onModuleInit(): void {
    if (this.removeProviderListener) return;

    this.removeFreshnessListener = this.marketFreshness.onFreshnessEvent((event) =>
      this.broadcastFreshness(event),
    );
    this.removeProviderListener = this.provider.onEvent((event) => this.handleProviderEvent(event));
    void this.provider.connect().catch((error: unknown) => {
      this.logger.warn("provider.initial_connect_failed", {}, error);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.removeProviderListener?.();
    this.removeProviderListener = undefined;
    this.removeFreshnessListener?.();
    this.removeFreshnessListener = undefined;

    try {
      await this.provider.close();
    } catch (error) {
      this.logger.warn("provider.close_failed", {}, error);
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
    setImmediate(() => void this.sendInitialState(client, command));
  }

  private handleProviderEvent(event: ProviderMarketEvent): void {
    try {
      this.broadcast(event);
      for (const candleEvent of this.candleAggregation.apply(event)) {
        this.marketCache.apply(candleEvent);
        this.broadcast(candleEvent);
      }
    } catch (error) {
      this.logger.warn("realtime.broadcast_failed", { symbol: event.symbol }, error);
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
      } catch (error) {
        this.logger.warn("realtime.send_failed", {}, error);
      }
    }
  }

  private async sendInitialState(client: WebSocket, command: SubscribeCommand): Promise<void> {
    if (client.readyState !== WebSocket.OPEN) return;

    for (const symbol of new Set(command.symbols)) {
      for (const channel of new Set(command.channels)) {
        if (channel === "candles") {
          await this.bootstrapCandleIntervals(symbol, command.options?.candleInterval);
        }
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

  private async bootstrapCandleIntervals(
    symbol: string,
    candleInterval: CandleInterval | undefined,
  ): Promise<void> {
    const intervals = candleInterval ? [candleInterval] : CANDLE_INTERVALS;
    await Promise.all(intervals.map((interval) => this.bootstrapCandle(symbol, interval)));
  }

  private async bootstrapCandle(symbol: string, interval: CandleInterval): Promise<void> {
    const key = `${symbol}\u0000${interval}`;
    if (this.bootstrappedCandleKeys.has(key)) return;

    const existingRequest = this.candleBootstrapRequests.get(key);
    if (existingRequest) return existingRequest;

    const request = this.provider
      .getHistoricalCandles({ interval, limit: 1, symbol })
      .then((candles) => {
        const currentCandle = candles.at(-1);
        if (!currentCandle) return;

        const event = this.candleAggregation.seed(
          symbol,
          interval,
          currentCandle,
          currentCandle.time * 1_000,
        );
        const cached = this.marketCache.getCandle(symbol, interval);
        if (!cached || event.candle.time > cached.candle.time) this.marketCache.apply(event);
        this.bootstrappedCandleKeys.add(key);
      })
      .catch((error: unknown) => {
        this.logger.warn("realtime.candle_bootstrap_failed", { interval, symbol }, error);
      })
      .finally(() => {
        this.candleBootstrapRequests.delete(key);
      });
    this.candleBootstrapRequests.set(key, request);
    return request;
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
