import { Module } from "@nestjs/common";

import { MarketModule } from "../markets/market.module";
import { RealtimeGateway } from "./realtime.gateway";
import { SubscriptionRegistry } from "./subscription-registry.service";

@Module({
  exports: [SubscriptionRegistry],
  imports: [MarketModule],
  providers: [RealtimeGateway, SubscriptionRegistry],
})
export class RealtimeModule {}
