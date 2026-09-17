import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MarketBuyService } from "./market-buy.service";

@Module({
  exports: [MarketBuyService],
  imports: [DatabaseModule, RealtimeModule],
  providers: [MarketBuyService],
})
export class TradingModule {}
