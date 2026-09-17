import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AuthModule } from "../auth/auth.module";
import { MarketBuyService } from "./market-buy.service";
import { MarketExecutionPriceService } from "./market-execution-price.service";
import { MarketSellService } from "./market-sell.service";
import { OrdersController } from "./orders.controller";

@Module({
  controllers: [OrdersController],
  exports: [MarketBuyService, MarketSellService],
  imports: [AuthModule, DatabaseModule, RealtimeModule],
  providers: [MarketBuyService, MarketExecutionPriceService, MarketSellService],
})
export class TradingModule {}
