import { z } from "zod";

import { unsignedDecimalStringSchema } from "../common/decimal.schema.js";

const marketSymbolSchema = z
  .string()
  .regex(/^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/)
  .max(41);
const positiveDecimalStringSchema = unsignedDecimalStringSchema.refine(
  (value) => !/^0(?:\.0+)?$/.test(value),
  "Expected a positive decimal string.",
);

export const marketOrderRequestSchema = z.strictObject({
  quantity: positiveDecimalStringSchema,
  side: z.enum(["BUY", "SELL"]),
  symbol: marketSymbolSchema,
  type: z.literal("MARKET"),
});

export const marketOrderResponseSchema = z.object({
  data: z.object({
    avgFillPrice: positiveDecimalStringSchema,
    id: z.uuid(),
    quantity: positiveDecimalStringSchema,
    side: z.enum(["BUY", "SELL"]),
    status: z.literal("FILLED"),
    symbol: marketSymbolSchema,
    type: z.literal("MARKET"),
  }),
});

export type MarketOrderRequest = z.infer<typeof marketOrderRequestSchema>;
export type MarketOrderResponse = z.infer<typeof marketOrderResponseSchema>;
