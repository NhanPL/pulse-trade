import { z } from "zod";

import type { ProviderTickerEvent } from "./market-data-provider";

const decimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const unsignedDecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const coinbaseTimestampSchema = z.iso.datetime({ offset: true });

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
