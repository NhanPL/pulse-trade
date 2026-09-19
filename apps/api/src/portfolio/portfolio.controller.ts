import { Controller, Get, Header, Headers } from "@nestjs/common";
import { portfolioResponseSchema, type PortfolioResponse } from "@pulse-trade/contracts";

import { CurrentUserService } from "../auth/current-user.service";
import { PortfolioService } from "./portfolio.service";

@Controller("portfolio")
export class PortfolioController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly portfolio: PortfolioService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async getPortfolio(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<PortfolioResponse> {
    const user = await this.currentUser.resolve(authorization);
    return portfolioResponseSchema.parse({ data: await this.portfolio.getSnapshot(user.id) });
  }
}
