import {
  candleSnapshotEventSchema,
  candleUpdateEventSchema,
  orderBookSnapshotEventSchema,
  orderBookUpdateEventSchema,
  REALTIME_PROTOCOL_VERSION,
  tickerUpdateEventSchema,
  tradesBatchEventSchema,
  type CandleSnapshotEvent,
  type CandleUpdateEvent,
  type OrderBookSnapshotEvent,
  type OrderBookUpdateEvent,
  type TickerUpdateEvent,
  type TradesBatchEvent,
} from "@pulse-trade/contracts";

import type { ProviderMarketEvent } from "../markets/provider/market-data-provider";

export type MarketRealtimeEvent =
  | TickerUpdateEvent
  | CandleSnapshotEvent
  | CandleUpdateEvent
  | OrderBookSnapshotEvent
  | OrderBookUpdateEvent
  | TradesBatchEvent;

export function mapProviderEvent(
  providerEvent: ProviderMarketEvent,
  serverTimestamp = Date.now(),
): MarketRealtimeEvent {
  const envelope = {
    symbol: providerEvent.symbol,
    ts: serverTimestamp,
    v: REALTIME_PROTOCOL_VERSION,
  };

  switch (providerEvent.type) {
    case "ticker":
      return tickerUpdateEventSchema.parse({
        ...envelope,
        data: {
          change24hPercent: providerEvent.change24hPercent,
          high24h: providerEvent.high24h,
          low24h: providerEvent.low24h,
          marketTs: providerEvent.marketTs,
          price: providerEvent.price,
          volume24h: providerEvent.volume24h,
        },
        event: "ticker.update",
      });
    case "candle.snapshot":
      return candleSnapshotEventSchema.parse({
        ...envelope,
        data: {
          candles: providerEvent.candles.map((candle) => ({ ...candle })),
          interval: providerEvent.interval,
        },
        event: "candle.snapshot",
      });
    case "candle.update":
      return candleUpdateEventSchema.parse({
        ...envelope,
        data: {
          candle: { ...providerEvent.candle },
          interval: providerEvent.interval,
        },
        event: "candle.update",
      });
    case "orderbook.snapshot":
      return orderBookSnapshotEventSchema.parse({
        ...envelope,
        data: {
          asks: providerEvent.asks.map(([price, quantity]) => [price, quantity]),
          bids: providerEvent.bids.map(([price, quantity]) => [price, quantity]),
          sequence: String(providerEvent.providerSequence),
        },
        event: "orderbook.snapshot",
      });
    case "orderbook.update":
      return orderBookUpdateEventSchema.parse({
        ...envelope,
        data: {
          changes: providerEvent.changes.map((change) => ({ ...change })),
          sequence: String(providerEvent.providerSequence),
        },
        event: "orderbook.update",
      });
    case "trades.batch":
      return tradesBatchEventSchema.parse({
        ...envelope,
        data: {
          trades: providerEvent.trades.map((trade) => ({ ...trade })),
        },
        event: "trades.batch",
      });
  }
}
