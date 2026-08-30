import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { z } from "zod";

import { MarketService, type HistoricalCandlesResponse } from "./market.service";
import { isSupportedMarketSymbol } from "./supported-markets";

export const HISTORICAL_CANDLES_DEFAULT_LIMIT = 300;
export const HISTORICAL_CANDLES_MAX_LIMIT = 350;

const historicalCandlesQuerySchema = z
  .object({
    interval: z.enum(["1m", "5m", "15m", "1h"]).default("1m"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(HISTORICAL_CANDLES_MAX_LIMIT)
      .default(HISTORICAL_CANDLES_DEFAULT_LIMIT),
  })
  .strict();

@Controller("markets")
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get(":symbol/candles")
  async getHistoricalCandles(
    @Param("symbol") rawSymbol: string,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<HistoricalCandlesResponse> {
    const symbol = rawSymbol.trim().toUpperCase();

    if (!isSupportedMarketSymbol(symbol)) {
      throw new BadRequestException({
        error: {
          code: "UNSUPPORTED_SYMBOL",
          details: null,
          message: `Unsupported market symbol: ${rawSymbol}`,
        },
      });
    }

    const result = historicalCandlesQuerySchema.safeParse(rawQuery);

    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: "INVALID_CANDLE_QUERY",
          details: z.flattenError(result.error).fieldErrors,
          message: "Invalid historical candles query.",
        },
      });
    }

    return this.marketService.getHistoricalCandles(symbol, result.data.interval, result.data.limit);
  }
}
