import { BadGatewayException, Inject, Injectable, Logger } from "@nestjs/common";

import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type ProviderCandle,
  type ProviderCandleInterval,
} from "./provider/market-data-provider";
import type { SupportedMarketSymbol } from "./supported-markets";

export type HistoricalCandlesResponse = Readonly<{
  data: Readonly<{
    candles: readonly ProviderCandle[];
    interval: ProviderCandleInterval;
    symbol: SupportedMarketSymbol;
  }>;
}>;

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
  ) {}

  async getHistoricalCandles(
    symbol: SupportedMarketSymbol,
    interval: ProviderCandleInterval,
    limit: number,
  ): Promise<HistoricalCandlesResponse> {
    try {
      const candles = await this.provider.getHistoricalCandles({ interval, limit, symbol });
      return { data: { candles, interval, symbol } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      this.logger.warn(`Historical candles unavailable for ${symbol}: ${message}`);

      throw new BadGatewayException({
        error: {
          code: "MARKET_DATA_UNAVAILABLE",
          details: null,
          message: "Historical market data is temporarily unavailable.",
        },
      });
    }
  }
}
