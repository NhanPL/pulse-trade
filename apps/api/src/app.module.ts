import { Module } from "@nestjs/common";

import { MarketModule } from "./markets/market.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({ imports: [MarketModule, RealtimeModule] })
export class AppModule {}
