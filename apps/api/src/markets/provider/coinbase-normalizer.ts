import { z } from "zod";

import type {
  ProviderCandle,
  ProviderCandleEvent,
  ProviderOrderBookChange,
  ProviderOrderBookEvent,
  ProviderOrderBookLevel,
  ProviderTickerEvent,
} from "./market-data-provider";

const decimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const unsignedDecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const coinbaseTimestampSchema = z.iso.datetime({ offset: true });
const unixSecondsStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/)
  .refine((value) => Number.isSafeInteger(Number(value)), "Expected safe UNIX seconds");

export const COINBASE_CANDLE_INTERVAL = "5m" as const;

const coinbaseCandleSchema = z.object({
  close: unsignedDecimalStringSchema,
  high: unsignedDecimalStringSchema,
  low: unsignedDecimalStringSchema,
  open: unsignedDecimalStringSchema,
  product_id: z.string().trim().min(1),
  start: unixSecondsStringSchema,
  volume: unsignedDecimalStringSchema,
});

type CoinbaseCandle = z.infer<typeof coinbaseCandleSchema>;

export const coinbaseCandlesEnvelopeSchema = z.object({
  channel: z.literal("candles"),
  events: z.array(
    z.object({
      candles: z.array(coinbaseCandleSchema),
      type: z.enum(["snapshot", "update"]),
    }),
  ),
  sequence_num: z.number().int().nonnegative(),
  timestamp: coinbaseTimestampSchema,
});

const coinbaseLevel2UpdateSchema = z.object({
  event_time: coinbaseTimestampSchema,
  new_quantity: unsignedDecimalStringSchema,
  price_level: unsignedDecimalStringSchema.refine(
    (value) => /[1-9]/.test(value),
    "Expected a positive price level",
  ),
  side: z.enum(["bid", "offer"]),
});

type CoinbaseLevel2Update = z.infer<typeof coinbaseLevel2UpdateSchema>;

export const coinbaseLevel2EnvelopeSchema = z.object({
  channel: z.literal("l2_data"),
  events: z.array(
    z.object({
      product_id: z.string().trim().min(1),
      type: z.enum(["snapshot", "update"]),
      updates: z.array(coinbaseLevel2UpdateSchema),
    }),
  ),
  sequence_num: z.number().int().nonnegative(),
  timestamp: coinbaseTimestampSchema,
});

export const coinbaseTickerEnvelopeSchema = z.object({
  channel: z.literal("ticker"),
  events: z.array(
    z.object({
      tickers: z.array(
        z.object({
          high_24_h: unsignedDecimalStringSchema,
          low_24_h: unsignedDecimalStringSchema,
          price: unsignedDecimalStringSchema,
          price_percent_chg_24_h: decimalStringSchema,
          product_id: z.string().trim().min(1),
          volume_24_h: unsignedDecimalStringSchema,
        }),
      ),
      type: z.enum(["snapshot", "update"]),
    }),
  ),
  sequence_num: z.number().int().nonnegative(),
  timestamp: coinbaseTimestampSchema,
});

/**
 * Validates the provider-specific envelope and returns only provider-neutral ticker fields.
 * Decimal strings stay untouched so downstream consumers never inherit floating-point loss.
 */
export function normalizeCoinbaseTickerMessage(message: unknown): readonly ProviderTickerEvent[] {
  const envelope = coinbaseTickerEnvelopeSchema.parse(message);
  const marketTs = Date.parse(envelope.timestamp);

  return envelope.events.flatMap((event) =>
    event.tickers.map((ticker) => ({
      change24hPercent: ticker.price_percent_chg_24_h,
      high24h: ticker.high_24_h,
      low24h: ticker.low_24_h,
      marketTs,
      price: ticker.price,
      providerSequence: envelope.sequence_num,
      symbol: ticker.product_id.toUpperCase(),
      type: "ticker" as const,
      volume24h: ticker.volume_24_h,
    })),
  );
}

export function normalizeCoinbaseCandleMessage(message: unknown): readonly ProviderCandleEvent[] {
  const envelope = coinbaseCandlesEnvelopeSchema.parse(message);
  const marketTs = Date.parse(envelope.timestamp);
  const normalizedEvents: ProviderCandleEvent[] = [];

  for (const event of envelope.events) {
    if (event.type === "snapshot") {
      const candlesBySymbol = new Map<string, ProviderCandle[]>();

      for (const candle of event.candles) {
        const symbol = candle.product_id.toUpperCase();
        const candles = candlesBySymbol.get(symbol) ?? [];
        candles.push(normalizeCoinbaseCandle(candle));
        candlesBySymbol.set(symbol, candles);
      }

      for (const [symbol, candles] of candlesBySymbol) {
        candles.sort((left, right) => left.time - right.time);
        normalizedEvents.push({
          candles,
          interval: COINBASE_CANDLE_INTERVAL,
          marketTs,
          providerSequence: envelope.sequence_num,
          symbol,
          type: "candle.snapshot",
        });
      }

      continue;
    }

    for (const candle of event.candles) {
      normalizedEvents.push({
        candle: normalizeCoinbaseCandle(candle),
        interval: COINBASE_CANDLE_INTERVAL,
        marketTs,
        providerSequence: envelope.sequence_num,
        symbol: candle.product_id.toUpperCase(),
        type: "candle.update",
      });
    }
  }

  return normalizedEvents;
}

function normalizeCoinbaseCandle(candle: CoinbaseCandle): ProviderCandle {
  return {
    close: candle.close,
    high: candle.high,
    low: candle.low,
    open: candle.open,
    time: Number(candle.start),
    volume: candle.volume,
  };
}

export function normalizeCoinbaseLevel2Message(
  message: unknown,
): readonly ProviderOrderBookEvent[] {
  const envelope = coinbaseLevel2EnvelopeSchema.parse(message);
  const envelopeMarketTs = Date.parse(envelope.timestamp);

  return envelope.events.map((event) => {
    const marketTs = getLatestLevel2MarketTs(event.updates, envelopeMarketTs);
    const symbol = event.product_id.toUpperCase();

    if (event.type === "snapshot") {
      const asks: ProviderOrderBookLevel[] = [];
      const bids: ProviderOrderBookLevel[] = [];

      for (const update of event.updates) {
        if (isZeroDecimal(update.new_quantity)) continue;

        const level: ProviderOrderBookLevel = [update.price_level, update.new_quantity];
        if (update.side === "bid") bids.push(level);
        else asks.push(level);
      }

      return {
        asks,
        bids,
        marketTs,
        providerSequence: envelope.sequence_num,
        symbol,
        type: "orderbook.snapshot" as const,
      };
    }

    return {
      changes: event.updates.map(normalizeCoinbaseLevel2Change),
      marketTs,
      providerSequence: envelope.sequence_num,
      symbol,
      type: "orderbook.update" as const,
    };
  });
}

function normalizeCoinbaseLevel2Change(update: CoinbaseLevel2Update): ProviderOrderBookChange {
  return {
    price: update.price_level,
    quantity: update.new_quantity,
    side: update.side === "bid" ? "BID" : "ASK",
  };
}

function getLatestLevel2MarketTs(
  updates: readonly CoinbaseLevel2Update[],
  fallbackMarketTs: number,
): number {
  let latestMarketTs: number | undefined;

  for (const update of updates) {
    const updateMarketTs = Date.parse(update.event_time);
    latestMarketTs =
      latestMarketTs === undefined ? updateMarketTs : Math.max(latestMarketTs, updateMarketTs);
  }

  return latestMarketTs ?? fallbackMarketTs;
}

function isZeroDecimal(value: string): boolean {
  return /^0(?:\.0+)?$/.test(value);
}
