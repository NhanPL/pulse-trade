import { z } from "zod";

export const REALTIME_PROTOCOL_VERSION = 1 as const;

export const realtimeProtocolVersionSchema = z.literal(REALTIME_PROTOCOL_VERSION);
export const realtimeTimestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const realtimeMarketSymbolSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[A-Z0-9]+-[A-Z0-9]+$/);

export const realtimeEnvelopeBaseSchema = z
  .object({
    ts: realtimeTimestampSchema,
    v: realtimeProtocolVersionSchema,
  })
  .strict();

export type RealtimeEnvelopeBase = z.infer<typeof realtimeEnvelopeBaseSchema>;
