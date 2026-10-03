import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import {
  watchlistAddRequestSchema,
  watchlistAddResponseSchema,
  watchlistListResponseSchema,
  watchlistRemoveParamsSchema,
  type WatchlistAddResponse,
  type WatchlistListResponse,
} from "@pulse-trade/contracts";

import { CurrentUserService } from "../auth/current-user.service";
import { WatchlistService } from "./watchlist.service";

@Controller("watchlist")
export class WatchlistController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly watchlist: WatchlistService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<WatchlistListResponse> {
    const user = await this.currentUser.resolve(authorization);
    return watchlistListResponseSchema.parse({
      data: { items: await this.watchlist.list(user.id) },
    });
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async add(
    @Body() body: unknown,
    @Headers("authorization") authorization: string | undefined,
  ): Promise<WatchlistAddResponse> {
    const user = await this.currentUser.resolve(authorization);
    const parsed = watchlistAddRequestSchema.safeParse(body);
    if (!parsed.success) throw invalidWatchlistRequest();
    return watchlistAddResponseSchema.parse({
      data: await this.watchlist.add(user.id, parsed.data.symbol),
    });
  }

  @Delete(":symbol")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  async remove(
    @Param("symbol") symbol: string,
    @Headers("authorization") authorization: string | undefined,
  ): Promise<void> {
    const user = await this.currentUser.resolve(authorization);
    const parsed = watchlistRemoveParamsSchema.safeParse({ symbol });
    if (!parsed.success) throw invalidWatchlistRequest();
    await this.watchlist.remove(user.id, parsed.data.symbol);
  }
}

function invalidWatchlistRequest(): BadRequestException {
  return new BadRequestException({
    error: {
      code: "INVALID_WATCHLIST_REQUEST",
      details: null,
      message: "Provide a valid market symbol without additional fields.",
    },
  });
}
