import {
  BadRequestException,
  Body,
  Controller,
  Post,
  HttpCode,
  Header,
  Headers,
  Res,
  ForbiddenException,
} from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { loginRequestSchema, type LoginResponse } from "@pulse-trade/contracts";
import { registerRequestSchema, type RegisterResponse } from "@pulse-trade/contracts";

import { RegistrationService } from "./registration.service";
import { LoginService } from "./login.service";
import { sessionCookie } from "./session-cookie";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly loginService: LoginService,
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
    // Prevent browser login CSRF; clients without Origin (e.g. CLI) may authenticate.
    if (origin !== undefined && origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) {
      throw new ForbiddenException({
        error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed.", details: null },
      });
    }
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
}
