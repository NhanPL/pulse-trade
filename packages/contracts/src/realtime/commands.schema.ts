import { z } from "zod";

import { realtimeMarketSymbolSchema, realtimeTimestampSchema } from "./envelope.schema.js";

export const realtimeChannelSchema = z.enum(["ticker", "candles", "orderbook", "trades"]);
export const candleIntervalSchema = z.enum(["1m", "5m", "15m", "1h"]);

export const subscriptionOptionsSchema = z
  .object({
    candleInterval: candleIntervalSchema.optional(),
  })
  .strict();

const subscriptionCommandFields = {
  channels: z.array(realtimeChannelSchema).min(1).max(4),
  requestId: z.uuid(),
  symbols: z.array(realtimeMarketSymbolSchema).min(1).max(50),
};

export const subscribeCommandSchema = z
  .object({
    action: z.literal("subscribe"),
    ...subscriptionCommandFields,
    options: subscriptionOptionsSchema.optional(),
  })
  .strict();

export const unsubscribeCommandSchema = z
  .object({
    action: z.literal("unsubscribe"),
    ...subscriptionCommandFields,
  })
  .strict();

export const pingCommandSchema = z
  .object({
    action: z.literal("ping"),
    ts: realtimeTimestampSchema,
  })
  .strict();

export const realtimeCommandSchema = z.discriminatedUnion("action", [
  subscribeCommandSchema,
  unsubscribeCommandSchema,
  pingCommandSchema,
]);

export type RealtimeChannel = z.infer<typeof realtimeChannelSchema>;
export type CandleInterval = z.infer<typeof candleIntervalSchema>;
export type SubscriptionOptions = z.infer<typeof subscriptionOptionsSchema>;
export type SubscribeCommand = z.infer<typeof subscribeCommandSchema>;
export type UnsubscribeCommand = z.infer<typeof unsubscribeCommandSchema>;
export type PingCommand = z.infer<typeof pingCommandSchema>;
export type RealtimeCommand = z.infer<typeof realtimeCommandSchema>;
