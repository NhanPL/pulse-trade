import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";

import { MarketModule } from "./markets/market.module";
import { PortfolioModule } from "./portfolio/portfolio.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { TradingModule } from "./trading/trading.module";
import { WatchlistModule } from "./watchlist/watchlist.module";

@Module({
  imports: [
    AuthModule,
    HealthModule,
    MarketModule,
    PortfolioModule,
    RealtimeModule,
    TradingModule,
    WatchlistModule,
  ],
})
export class AppModule {}
