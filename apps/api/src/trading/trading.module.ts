import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AuthModule } from "../auth/auth.module";
import { LimitBuyService } from "./limit-buy.service";
import { LimitSellService } from "./limit-sell.service";
import { MarketBuyService } from "./market-buy.service";
import { MarketExecutionPriceService } from "./market-execution-price.service";
import { MarketSellService } from "./market-sell.service";
import { OrdersController } from "./orders.controller";

@Module({
  controllers: [OrdersController],
  exports: [LimitBuyService, LimitSellService, MarketBuyService, MarketSellService],
  imports: [AuthModule, DatabaseModule, RealtimeModule],
  providers: [
    LimitBuyService,
    LimitSellService,
    MarketBuyService,
    MarketExecutionPriceService,
    MarketSellService,
  ],
})
export class TradingModule {}
