import { jwtVerify } from "jose";
import { z } from "zod";

const identitySchema = z.object({ sub: z.uuid(), sid: z.uuid() });

export async function verifyAccessIdentity(
  authorization: string | undefined,
  secret: string | undefined,
): Promise<{ id: string; userId: string } | undefined> {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match || !secret || secret.length < 32) return undefined;
  try {
    const { payload } = await jwtVerify(match[1], Buffer.from(secret, "utf8"), {
      algorithms: ["HS256"],
      issuer: "pulse-trade-api",
      audience: "pulse-trade-web",
      typ: "JWT",
      requiredClaims: ["sub", "sid", "exp", "iat"],
    });
    const identity = identitySchema.safeParse(payload);
    if (!identity.success) return undefined;
    return { id: identity.data.sid, userId: identity.data.sub };
  } catch {
    // Never use decoded but unverified claims, or expose credentials in verification errors.
    return undefined;
  }
}
