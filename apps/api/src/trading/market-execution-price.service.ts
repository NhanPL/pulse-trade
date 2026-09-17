import { Injectable } from "@nestjs/common";

import { MarketCacheService } from "../realtime/market-cache.service";
import { MarketFreshnessService } from "../realtime/freshness.service";
import { MarketOrderError } from "./market-order.error";
import { parseMarketExecutionPrice } from "./market-order.input";

@Injectable()
export class MarketExecutionPriceService {
  constructor(
    private readonly marketCache: MarketCacheService,
    private readonly marketFreshness: MarketFreshnessService,
  ) {}

  getPrice(symbol: string): string {
    const price = parseMarketExecutionPrice(this.marketCache.getTicker(symbol)?.price);
    // A cached ticker can survive an upstream disconnect, so order execution fails closed until live.
    if (this.marketFreshness.getCurrentEvent(symbol)?.event !== "market.live") {
      throw new MarketOrderError(
        "MARKET_DATA_STALE",
        "Current market data is stale. Please wait for a live update before placing an order.",
      );
    }
    return price;
  }
}
