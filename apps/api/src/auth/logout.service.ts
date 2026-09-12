import { createHash } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { verifyAccessIdentity } from "./access-identity";

@Injectable()
export class LogoutService {
  constructor(private readonly prisma: PrismaService) {}

  async logout(refreshToken: string | undefined, authorization: string | undefined): Promise<void> {
    try {
      // A verified access token identifies the stable session even if refresh rotated its cookie first.
      const identity = await verifyAccessIdentity(authorization, process.env.JWT_ACCESS_SECRET);
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
}
