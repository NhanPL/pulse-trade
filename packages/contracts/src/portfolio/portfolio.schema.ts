import { z } from "zod";

import { decimalStringSchema, unsignedDecimalStringSchema } from "../common/decimal.schema.js";

const assetSchema = z
  .string()
  .regex(/^[A-Z0-9]{1,20}$/)
  .max(20);

export const portfolioResponseSchema = z
  .object({
    data: z
      .object({
        cash: z
          .object({
            available: unsignedDecimalStringSchema,
            locked: unsignedDecimalStringSchema,
          })
          .strict(),
        positions: z.array(
          z
            .object({
              asset: assetSchema,
              averageCost: unsignedDecimalStringSchema,
              quantity: unsignedDecimalStringSchema,
              realizedPnl: decimalStringSchema,
            })
            .strict(),
        ),
        quoteCurrency: z.literal("USD"),
      })
      .strict(),
  })
  .strict();

export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;
