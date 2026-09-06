import { z } from "zod";

import { candleIntervalSchema } from "../realtime/commands.schema.js";
import { realtimeMarketSymbolSchema } from "../realtime/envelope.schema.js";
import { candleSchema } from "../realtime/events.schema.js";

export const historicalCandlesResponseSchema = z
  .object({
    data: z
      .object({
        candles: z.array(candleSchema),
        interval: candleIntervalSchema,
        symbol: realtimeMarketSymbolSchema,
      })
      .strict(),
  })
  .strict();

export type HistoricalCandlesResponse = z.infer<typeof historicalCandlesResponseSchema>;
