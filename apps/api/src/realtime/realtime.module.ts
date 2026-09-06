import { Module } from "@nestjs/common";

import { MarketModule } from "../markets/market.module";
import { CandleAggregationService } from "./candle-aggregation.service";
import { MarketCacheService } from "./market-cache.service";
import { MarketEventBroadcaster } from "./market-event-broadcaster.service";
import { MarketFreshnessService } from "./freshness.service";
import { RealtimeGateway } from "./realtime.gateway";
import { SubscriptionRegistry } from "./subscription-registry.service";

@Module({
  exports: [SubscriptionRegistry],
  imports: [MarketModule],
  providers: [
    CandleAggregationService,
    MarketCacheService,
    MarketFreshnessService,
    MarketEventBroadcaster,
    RealtimeGateway,
    SubscriptionRegistry,
  ],
})
export class RealtimeModule {}
