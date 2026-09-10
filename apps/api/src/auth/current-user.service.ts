import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { MeResponse } from "@pulse-trade/contracts";

import { PrismaService } from "../database/prisma.service";
import { verifyAccessIdentity } from "./access-identity";

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    error: { code: "UNAUTHENTICATED", message: "Authentication is required.", details: null },
  });
}

@Injectable()
export class CurrentUserService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(authorization: string | undefined): Promise<MeResponse["data"]["user"]> {
    if (!authorization?.match(/^Bearer ([^\s]+)$/i)) throw unauthenticated();
    try {
      const secret = process.env.JWT_ACCESS_SECRET;
      if (!secret || secret.length < 32) throw new Error("Access verification is not configured.");
      const identity = await verifyAccessIdentity(authorization, secret);
      if (!identity) throw unauthenticated();

      // Check revocation on every request: a signed JWT alone is insufficient after logout.
      const session = await this.prisma.client.session.findFirst({
        where: {
          id: identity.id,
          userId: identity.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { user: { select: { id: true, email: true } } },
      });
      if (!session) throw unauthenticated();
      return session.user;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException({
        error: {
          code: "AUTH_UNAVAILABLE",
          message: "Authentication is unavailable. Please try again later.",
          details: null,
        },
      });
    }
  }
}
