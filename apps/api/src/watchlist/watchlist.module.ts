import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { WatchlistController } from "./watchlist.controller";
import { WatchlistService } from "./watchlist.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
