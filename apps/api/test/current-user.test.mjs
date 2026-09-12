import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { SignJWT } from "jose";

const require = createRequire(import.meta.url);
const { CurrentUserService } = require("../dist/auth/current-user.service.js");
const { verifyAccessIdentity } = require("../dist/auth/access-identity.js");

test("missing or non-bearer authorization is rejected before storage access", async () => {
  const service = new CurrentUserService({
    get client() {
      return assert.fail("must not access DB");
    },
  });
  for (const header of [undefined, "", "Basic anything", "Bearer ", "Bearer a b"]) {
    await assert.rejects(
      service.resolve(header),
      (error) => error.getStatus() === 401 && error.getResponse().error.code === "UNAUTHENTICATED",
    );
  }
});

test("verified claims require UUID user and session identifiers", async () => {
  const secret = randomBytes(32).toString("hex");
  const token = await new SignJWT({ sid: "not-a-uuid" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(randomUUID())
    .setIssuer("pulse-trade-api")
    .setAudience("pulse-trade-web")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(Buffer.from(secret));
  assert.equal(await verifyAccessIdentity(`Bearer ${token}`, secret), undefined);
  assert.equal(await verifyAccessIdentity("Bearer invalid", secret), undefined);
});

test("current-user lookup scopes session to the signed user and sanitizes storage failure", async (t) => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const secret = randomBytes(32).toString("hex");
  process.env.JWT_ACCESS_SECRET = secret;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  });
  const userId = randomUUID();
  const sessionId = randomUUID();
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer("pulse-trade-api")
    .setAudience("pulse-trade-web")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(Buffer.from(secret));
  const service = new CurrentUserService({
    client: {
      session: {
        async findFirst(query) {
          assert.equal(query.where.id, sessionId);
          assert.equal(query.where.userId, userId);
          assert.equal(query.where.revokedAt, null);
          assert.ok(query.where.expiresAt.gt instanceof Date);
          assert.deepEqual(query.select, { user: { select: { id: true, email: true } } });
          throw new Error("private database information");
        },
      },
    },
  });
  await assert.rejects(service.resolve(`Bearer ${token}`), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().error.code, "AUTH_UNAVAILABLE");
    assert.equal(JSON.stringify(error.getResponse()).includes("private database"), false);
    return true;
  });
});
