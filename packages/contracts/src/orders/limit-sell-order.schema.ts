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

export const limitSellOrderRequestSchema = z.strictObject({
  limitPrice: positiveDecimalStringSchema,
  quantity: positiveDecimalStringSchema,
  side: z.literal("SELL"),
  symbol: marketSymbolSchema,
  type: z.literal("LIMIT"),
});

export const limitSellOrderResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    limitPrice: positiveDecimalStringSchema,
    quantity: positiveDecimalStringSchema,
    side: z.literal("SELL"),
    status: z.literal("PENDING"),
    symbol: marketSymbolSchema,
    type: z.literal("LIMIT"),
  }),
});

export type LimitSellOrderRequest = z.infer<typeof limitSellOrderRequestSchema>;
export type LimitSellOrderResponse = z.infer<typeof limitSellOrderResponseSchema>;
