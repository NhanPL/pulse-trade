import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MarketBuyService } from "./market-buy.service";
import { MarketExecutionPriceService } from "./market-execution-price.service";
import { MarketSellService } from "./market-sell.service";

@Module({
  exports: [MarketBuyService, MarketSellService],
  imports: [DatabaseModule, RealtimeModule],
  providers: [MarketBuyService, MarketExecutionPriceService, MarketSellService],
})
export class TradingModule {}
