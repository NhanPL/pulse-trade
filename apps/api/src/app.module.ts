import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";

import { MarketModule } from "./markets/market.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({ imports: [AuthModule, MarketModule, RealtimeModule] })
export class AppModule {}
