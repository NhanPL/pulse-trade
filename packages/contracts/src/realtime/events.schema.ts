import { z } from "zod";

import { decimalStringSchema, unsignedDecimalStringSchema } from "../common/decimal.schema.js";
import { candleIntervalSchema } from "./commands.schema.js";
import {
  realtimeMarketSymbolSchema,
  realtimeProtocolVersionSchema,
  realtimeTimestampSchema,
} from "./envelope.schema.js";

const eventEnvelopeFields = {
  ts: realtimeTimestampSchema,
  v: realtimeProtocolVersionSchema,
};

export const candleSchema = z
  .object({
    close: unsignedDecimalStringSchema,
    high: unsignedDecimalStringSchema,
    low: unsignedDecimalStringSchema,
    open: unsignedDecimalStringSchema,
    time: realtimeTimestampSchema,
    volume: unsignedDecimalStringSchema,
  })
  .strict();

export const orderBookLevelSchema = z.tuple([
  unsignedDecimalStringSchema,
  unsignedDecimalStringSchema,
]);

export const orderBookSequenceSchema = z.string().regex(/^(?:0|[1-9]\d*)$/);

export const tradeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    marketTs: realtimeTimestampSchema,
    price: unsignedDecimalStringSchema,
    quantity: unsignedDecimalStringSchema,
    side: z.enum(["BUY", "SELL"]),
  })
  .strict();

export const subscriptionAckEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        accepted: z.boolean(),
        requestId: z.uuid(),
      })
      .strict(),
    event: z.literal("subscription.ack"),
  })
  .strict();

export const connectionReadyEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        connectionId: z.uuid(),
      })
      .strict(),
    event: z.literal("connection.ready"),
  })
  .strict();

export const tickerUpdateEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        change24hPercent: decimalStringSchema,
        high24h: unsignedDecimalStringSchema,
        low24h: unsignedDecimalStringSchema,
        marketTs: realtimeTimestampSchema,
        price: unsignedDecimalStringSchema,
        volume24h: unsignedDecimalStringSchema,
      })
      .strict(),
    event: z.literal("ticker.update"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const candleSnapshotEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        candles: z.array(candleSchema),
        interval: candleIntervalSchema,
      })
      .strict(),
    event: z.literal("candle.snapshot"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const candleUpdateEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        candle: candleSchema,
        interval: candleIntervalSchema,
      })
      .strict(),
    event: z.literal("candle.update"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const orderBookSnapshotEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        asks: z.array(orderBookLevelSchema),
        bids: z.array(orderBookLevelSchema),
        sequence: orderBookSequenceSchema,
      })
      .strict(),
    event: z.literal("orderbook.snapshot"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const orderBookUpdateEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        changes: z.array(
          z
            .object({
              price: unsignedDecimalStringSchema,
              quantity: unsignedDecimalStringSchema,
              side: z.enum(["BID", "ASK"]),
            })
            .strict(),
        ),
        sequence: orderBookSequenceSchema,
      })
      .strict(),
    event: z.literal("orderbook.update"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const tradesBatchEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        trades: z.array(tradeSchema),
      })
      .strict(),
    event: z.literal("trades.batch"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const marketStaleEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        lastUpdateTs: realtimeTimestampSchema,
        reason: z.literal("UPSTREAM_DISCONNECTED"),
      })
      .strict(),
    event: z.literal("market.stale"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const marketLiveEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z.object({}).strict(),
    event: z.literal("market.live"),
    symbol: realtimeMarketSymbolSchema,
  })
  .strict();

export const errorEventSchema = z
  .object({
    ...eventEnvelopeFields,
    data: z
      .object({
        code: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Z][A-Z0-9_]*$/),
        message: z.string().min(1).max(500),
        requestId: z.uuid(),
      })
      .strict(),
    event: z.literal("error"),
  })
  .strict();

export const realtimeEventSchema = z.discriminatedUnion("event", [
  subscriptionAckEventSchema,
  connectionReadyEventSchema,
  tickerUpdateEventSchema,
  candleSnapshotEventSchema,
  candleUpdateEventSchema,
  orderBookSnapshotEventSchema,
  orderBookUpdateEventSchema,
  tradesBatchEventSchema,
  marketStaleEventSchema,
  marketLiveEventSchema,
  errorEventSchema,
]);

export type Candle = z.infer<typeof candleSchema>;
export type OrderBookLevel = z.infer<typeof orderBookLevelSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type SubscriptionAckEvent = z.infer<typeof subscriptionAckEventSchema>;
export type ConnectionReadyEvent = z.infer<typeof connectionReadyEventSchema>;
export type TickerUpdateEvent = z.infer<typeof tickerUpdateEventSchema>;
export type CandleSnapshotEvent = z.infer<typeof candleSnapshotEventSchema>;
export type CandleUpdateEvent = z.infer<typeof candleUpdateEventSchema>;
export type OrderBookSnapshotEvent = z.infer<typeof orderBookSnapshotEventSchema>;
export type OrderBookUpdateEvent = z.infer<typeof orderBookUpdateEventSchema>;
export type TradesBatchEvent = z.infer<typeof tradesBatchEventSchema>;
export type MarketStaleEvent = z.infer<typeof marketStaleEventSchema>;
export type MarketLiveEvent = z.infer<typeof marketLiveEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
