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
const ordersPageLimitSchema = z.preprocess(
  (value) => (value === undefined ? "20" : value),
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(100)),
);

export const orderSideSchema = z.enum(["BUY", "SELL"]);
export const orderStatusSchema = z.enum(["PENDING", "FILLED", "CANCELLED", "REJECTED"]);
export const orderTypeSchema = z.enum(["MARKET", "LIMIT"]);

export const ordersListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: ordersPageLimitSchema,
  side: orderSideSchema.optional(),
  status: orderStatusSchema.optional(),
  symbol: marketSymbolSchema.optional(),
});

export const orderListItemSchema = z.strictObject({
  avgFillPrice: positiveDecimalStringSchema.nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  filledAt: z.iso.datetime().nullable(),
  filledQuantity: unsignedDecimalStringSchema,
  id: z.uuid(),
  limitPrice: positiveDecimalStringSchema.nullable(),
  quantity: positiveDecimalStringSchema,
  side: orderSideSchema,
  status: orderStatusSchema,
  symbol: marketSymbolSchema,
  type: orderTypeSchema,
});

export const ordersListResponseSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(orderListItemSchema),
    nextCursor: z.uuid().nullable(),
  }),
});

export type OrderListItem = z.infer<typeof orderListItemSchema>;
export type OrdersListQuery = z.infer<typeof ordersListQuerySchema>;
export type OrdersListResponse = z.infer<typeof ordersListResponseSchema>;
