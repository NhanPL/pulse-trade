import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { SignJWT } from "jose";

import { PrismaService } from "../database/prisma.service";

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, userAgent?: string) {
    const id = randomUUID();
    const refreshToken = randomBytes(32).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((now + SESSION_SECONDS) * 1000);
    const accessToken = await this.signAccessToken(userId, id, now, ACCESS_TOKEN_SECONDS);

    // High-entropy random credentials can use SHA-256; passwords still use Argon2id.
    await this.prisma.client.session.create({
      data: {
        id,
        userId,
        expiresAt,
        refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex"),
        userAgent: userAgent?.slice(0, 512),
      },
      select: { id: true },
    });
    return { accessToken, refreshToken, session: { id, expiresAt: expiresAt.toISOString() } };
  }

  signAccessToken(
    userId: string,
    sessionId: string,
    issuedAt: number,
    expiresIn: number,
  ): Promise<string> {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new Error("Access token signing is not configured.");
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuer("pulse-trade-api")
      .setAudience("pulse-trade-web")
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + expiresIn)
      .sign(Buffer.from(secret, "utf8"));
  }
}
