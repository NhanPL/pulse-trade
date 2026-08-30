import { Module } from "@nestjs/common";

import { MarketController } from "./market.controller";
import { MarketService } from "./market.service";
import { CoinbaseProvider } from "./provider/coinbase-provider";
import { MARKET_DATA_PROVIDER } from "./provider/market-data-provider";

@Module({
  controllers: [MarketController],
  exports: [MARKET_DATA_PROVIDER, MarketService],
  providers: [
    MarketService,
    {
      provide: MARKET_DATA_PROVIDER,
      useClass: CoinbaseProvider,
    },
  ],
})
export class MarketModule {}
