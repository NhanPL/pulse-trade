import {
  BadRequestException,
  Body,
  Controller,
  Post,
  HttpCode,
  Header,
  Headers,
  Res,
} from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { loginRequestSchema, type LoginResponse } from "@pulse-trade/contracts";
import { registerRequestSchema, type RegisterResponse } from "@pulse-trade/contracts";
import { refreshRequestSchema, type RefreshResponse } from "@pulse-trade/contracts";
import { logoutRequestSchema } from "@pulse-trade/contracts";

import { RegistrationService } from "./registration.service";
import { LoginService } from "./login.service";
import { sessionCookie, readRefreshCookie, clearSessionCookie } from "./session-cookie";
import { assertAuthOrigin } from "./auth-origin";
import { RefreshService } from "./refresh.service";
import { LogoutService } from "./logout.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly loginService: LoginService,
    private readonly refreshService: RefreshService,
    private readonly logoutService: LogoutService,
  ) {}

  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async login(
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<LoginResponse> {
    assertAuthOrigin(origin);
    const result = loginRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: "INVALID_LOGIN",
          message: "Provide a valid email and password.",
          details: null,
        },
      });
    }
    const loggedIn = await this.loginService.login(result.data, userAgent);
    response.setHeader(
      "Set-Cookie",
      sessionCookie(loggedIn.refreshToken, process.env.NODE_ENV === "production"),
    );
    return loggedIn.response;
  }

  @Post("register")
  register(@Body() body: unknown): Promise<RegisterResponse> {
    const result = registerRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: "INVALID_REGISTRATION",
          message: "Provide a valid email and a password of 8–128 characters.",
          details: null,
        },
      });
    }
    return this.registration.register(result.data);
  }

  @Post("logout")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  async logout(
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Headers("cookie") cookie: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<void> {
    assertAuthOrigin(origin);
    if (!logoutRequestSchema.safeParse(body).success) {
      throw new BadRequestException({
        error: {
          code: "INVALID_LOGOUT",
          message: "Logout does not accept request fields.",
          details: null,
        },
      });
    }
    await this.logoutService.logout(readRefreshCookie(cookie), authorization);
    response.setHeader("Set-Cookie", clearSessionCookie(process.env.NODE_ENV === "production"));
  }

  @Post("refresh")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async refresh(
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Headers("cookie") cookie: string | undefined,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<RefreshResponse> {
    assertAuthOrigin(origin);
    if (!refreshRequestSchema.safeParse(body).success) {
      throw new BadRequestException({
        error: {
          code: "INVALID_REFRESH",
          message: "Refresh does not accept request fields.",
          details: null,
        },
      });
    }
    const refreshed = await this.refreshService.refresh(readRefreshCookie(cookie));
    // Only success writes the cookie: a concurrent losing request must not clear the winner's token.
    response.setHeader(
      "Set-Cookie",
      sessionCookie(
        refreshed.refreshToken,
        process.env.NODE_ENV === "production",
        refreshed.cookieMaxAge,
      ),
    );
    return refreshed.response;
  }
}
