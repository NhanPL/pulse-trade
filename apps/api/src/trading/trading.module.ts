import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MarketBuyService } from "./market-buy.service";
import { MarketSellService } from "./market-sell.service";

@Module({
  exports: [MarketBuyService, MarketSellService],
  imports: [DatabaseModule, RealtimeModule],
  providers: [MarketBuyService, MarketSellService],
})
export class TradingModule {}
