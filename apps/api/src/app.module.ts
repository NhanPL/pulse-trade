import { Module } from "@nestjs/common";

import { MarketModule } from "./markets/market.module";

@Module({ imports: [MarketModule] })
export class AppModule {}
