import { createHash, randomBytes } from "node:crypto";
import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { RefreshResponse } from "@pulse-trade/contracts";

import { PrismaService } from "../database/prisma.service";
import { ACCESS_TOKEN_SECONDS, SessionService } from "./session.service";

function invalidSession(): UnauthorizedException {
  return new UnauthorizedException({
    error: {
      code: "INVALID_SESSION",
      message: "Session is invalid or expired. Please log in again.",
      details: null,
    },
  });
}

@Injectable()
export class RefreshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async refresh(token: string | undefined): Promise<{
    response: RefreshResponse;
    refreshToken: string;
    cookieMaxAge: number;
  }> {
    if (!token) throw invalidSession();
    const oldHash = createHash("sha256").update(token).digest("hex");
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        const session = await transaction.session.findUnique({
          where: { refreshTokenHash: oldHash },
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
            user: { select: { id: true, email: true } },
          },
        });
        const now = Math.floor(Date.now() / 1000);
        const remaining = session ? Math.floor(session.expiresAt.getTime() / 1000) - now : 0;
        if (!session || session.revokedAt !== null || remaining <= 0) throw invalidSession();

        const expiresIn = Math.min(ACCESS_TOKEN_SECONDS, remaining);
        const refreshToken = randomBytes(32).toString("base64url");
        const accessToken = await this.sessions.signAccessToken(
          session.userId,
          session.id,
          now,
          expiresIn,
        );
        // Compare-and-swap: the hash, expiry and revocation predicate is rechecked under PostgreSQL's row lock.
        const updated = await transaction.session.updateMany({
          where: {
            id: session.id,
            refreshTokenHash: oldHash,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex"),
            lastUsedAt: new Date(),
          },
        });
        if (updated.count !== 1) throw invalidSession();

        return {
          response: {
            data: {
              user: session.user,
              accessToken,
              tokenType: "Bearer",
              expiresIn,
              session: { id: session.id, expiresAt: session.expiresAt.toISOString() },
            },
          },
          refreshToken,
          cookieMaxAge: remaining,
        };
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Do not leak database queries, stored hashes, or signing configuration through error logging.
      throw new ServiceUnavailableException({
        error: {
          code: "REFRESH_UNAVAILABLE",
          message: "Refresh is unavailable. Please try again later.",
          details: null,
        },
      });
    }
  }
}
