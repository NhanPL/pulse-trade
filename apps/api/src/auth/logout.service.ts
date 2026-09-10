import { createHash } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { jwtVerify } from "jose";

import { PrismaService } from "../database/prisma.service";

@Injectable()
export class LogoutService {
  constructor(private readonly prisma: PrismaService) {}

  async logout(refreshToken: string | undefined, authorization: string | undefined): Promise<void> {
    try {
      // A verified access token identifies the stable session even if refresh rotated its cookie first.
      const identity = await this.accessIdentity(authorization);
      let target = identity;
      if (!target && refreshToken) {
        target =
          (await this.prisma.client.session.findUnique({
            where: { refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex") },
            select: { id: true, userId: true },
          })) ?? undefined;
      }
      if (!target) return;

      // Do not match the old hash again: rotation after lookup must not prevent revocation.
      await this.prisma.client.session.updateMany({
        where: { id: target.id, userId: target.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Keep the cookie on storage failure so logout can be retried; never log credentials.
      throw new ServiceUnavailableException({
        error: {
          code: "LOGOUT_UNAVAILABLE",
          message: "Logout is unavailable. Please try again later.",
          details: null,
        },
      });
    }
  }

  private async accessIdentity(
    authorization: string | undefined,
  ): Promise<{ id: string; userId: string } | undefined> {
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!match || !secret || secret.length < 32) return undefined;
    try {
      const { payload } = await jwtVerify(match[1], Buffer.from(secret, "utf8"), {
        algorithms: ["HS256"],
        issuer: "pulse-trade-api",
        audience: "pulse-trade-web",
        typ: "JWT",
        requiredClaims: ["sub", "sid", "exp", "iat"],
      });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return undefined;
      return { id: payload.sid, userId: payload.sub };
    } catch {
      // Invalid or expired bearer credentials may fall back to the HttpOnly cookie.
      return undefined;
    }
  }
}
