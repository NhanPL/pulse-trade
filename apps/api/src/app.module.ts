import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";

import { MarketModule } from "./markets/market.module";
import { PortfolioModule } from "./portfolio/portfolio.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { TradingModule } from "./trading/trading.module";

@Module({ imports: [AuthModule, MarketModule, PortfolioModule, RealtimeModule, TradingModule] })
export class AppModule {}
