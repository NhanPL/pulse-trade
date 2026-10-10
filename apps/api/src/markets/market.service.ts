import { BadGatewayException, Inject, Injectable } from "@nestjs/common";

import { BackendLogger } from "../observability/backend-logger";

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
  private readonly logger = new BackendLogger("MarketService");

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
      this.logger.warn("market.history_failed", { interval, symbol }, error);

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
