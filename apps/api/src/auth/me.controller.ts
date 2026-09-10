import { Controller, Get, Header, Headers } from "@nestjs/common";
import type { MeResponse } from "@pulse-trade/contracts";

import { CurrentUserService } from "./current-user.service";

@Controller("me")
export class MeController {
  constructor(private readonly currentUser: CurrentUserService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async me(@Headers("authorization") authorization: string | undefined): Promise<MeResponse> {
    return { data: { user: await this.currentUser.resolve(authorization) } };
  }
}
