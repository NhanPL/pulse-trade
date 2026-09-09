import { randomBytes } from "node:crypto";
import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { LoginRequest, LoginResponse } from "@pulse-trade/contracts";

import { PrismaService } from "../database/prisma.service";
import { PasswordHashService } from "./password-hash.service";
import { ACCESS_TOKEN_SECONDS, SessionService } from "./session.service";

@Injectable()
export class LoginService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHashService,
    private readonly sessions: SessionService,
  ) {}

  async login(
    input: LoginRequest,
    userAgent?: string,
  ): Promise<{ response: LoginResponse; refreshToken: string }> {
    try {
      const user = await this.prisma.client.user.findUnique({
        where: { email: input.email },
        select: { id: true, email: true, passwordHash: true },
      });
      // Missing accounts still perform password verification instead of returning immediately.
      const storedHash =
        user?.passwordHash ??
        (await (this.dummyHash ??= this.passwords.hash(randomBytes(32).toString("base64url"))));
      const valid = await this.passwords.verify(input.password, storedHash);
      if (!user || !valid) {
        throw new UnauthorizedException({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
            details: null,
          },
        });
      }
      const issued = await this.sessions.create(user.id, userAgent);
      return {
        response: {
          data: {
            user: { id: user.id, email: user.email },
            accessToken: issued.accessToken,
            tokenType: "Bearer",
            expiresIn: ACCESS_TOKEN_SECONDS,
            session: issued.session,
          },
        },
        refreshToken: issued.refreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Database/crypto errors must not expose hashes, credentials or connection details.
      throw new ServiceUnavailableException({
        error: {
          code: "LOGIN_UNAVAILABLE",
          message: "Login is unavailable. Please try again later.",
          details: null,
        },
      });
    }
  }
}
