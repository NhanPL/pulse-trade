import { z } from "zod";

import type {
  ProviderCandle,
  ProviderCandleEvent,
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
