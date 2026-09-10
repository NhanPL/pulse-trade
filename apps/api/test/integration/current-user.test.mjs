import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import test from "node:test";
import { SignJWT } from "jose";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { AuthModule } = require("../../dist/auth/auth.module.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const { configureHttpApplication } = require("../../dist/config/http-application.js");
const { meResponseSchema } = require("@pulse-trade/contracts");

test("current-user authentication on PostgreSQL", async (t) => {
  assert.ok(
    process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.endsWith("_test"),
  );
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const secret = randomBytes(32).toString("hex");
  process.env.JWT_ACCESS_SECRET = secret;
  const app = await NestFactory.create(AuthModule, { logger: false });
  const client = app.get(PrismaService).client;
  const emails = [0, 1, 2].map(() => `me-${randomUUID()}@example.com`);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  t.after(async () => {
    try {
      await client.$transaction([
        client.walletBalance.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
      ]);
    } finally {
      await app.close();
      if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = oldSecret;
    }
  });
  configureHttpApplication(app, { nodeEnv: "test", port: 3001, webOrigin: origin });
  await app.listen(0, "127.0.0.1");
  const base = `${await app.getUrl()}/api/v1`;
  const post = (route, body, cookie) =>
    globalThis.fetch(`${base}/auth/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  const getMe = (accessToken, query = "", cookie) =>
    globalThis.fetch(`${base}/me${query}`, {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
  const login = async (email = emails[0]) => {
    const response = await post("login", { email, password: "current-user-password" });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get("set-cookie").split(";")[0],
      data: (await response.json()).data,
    };
  };
  for (const email of emails) {
    assert.equal(
      (await post("register", { email, password: "current-user-password" })).status,
      201,
    );
  }
  const primary = await login();
  const other = await login(emails[1]);

  await t.test(
    "returns only the authenticated user and ignores query-string identity",
    async () => {
      const response = await getMe(primary.data.accessToken, `?userId=${other.data.user.id}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("set-cookie"), null);
      const body = await response.json();
      meResponseSchema.parse(body);
      assert.deepEqual(body, { data: { user: primary.data.user } });
      const second = await getMe(other.data.accessToken);
      assert.deepEqual(await second.json(), { data: { user: other.data.user } });
      const session = await client.session.findUniqueOrThrow({
        where: { id: primary.data.session.id },
      });
      assert.equal(session.lastUsedAt, null);
    },
  );

  await t.test("cookies alone, forged tokens and invalid JWT claims are unauthorized", async () => {
    const makeToken = (options = {}) =>
      new SignJWT({ ...(options.omitSid ? {} : { sid: options.sid ?? primary.data.session.id }) })
        .setProtectedHeader({ alg: options.alg ?? "HS256", typ: options.typ ?? "JWT" })
        .setSubject(options.sub ?? primary.data.user.id)
        .setIssuer(options.issuer ?? "pulse-trade-api")
        .setAudience(options.audience ?? "pulse-trade-web")
        .setIssuedAt()
        .setExpirationTime(options.exp ?? "15m")
        .sign(options.key ?? Buffer.from(secret));
    const invalidTokens = [
      undefined,
      "invalid",
      await makeToken({ key: randomBytes(32) }),
      await makeToken({ exp: "-1m" }),
      await makeToken({ audience: "other-app" }),
      await makeToken({ issuer: "other-issuer" }),
      await makeToken({ typ: "other-token" }),
      await makeToken({ alg: "HS384" }),
      await makeToken({ omitSid: true }),
      await makeToken({ sub: "invalid-uuid" }),
      await makeToken({ sid: "invalid-uuid" }),
      await makeToken({ sid: randomUUID() }),
      await makeToken({ sub: other.data.user.id }),
    ];
    for (const token of invalidTokens) {
      const response = await getMe(token, "", primary.cookie);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: { code: "UNAUTHENTICATED", message: "Authentication is required.", details: null },
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("set-cookie"), null);
    }
  });

  await t.test(
    "refresh tokens work for refresh, while logout immediately denies previously issued access JWTs",
    async () => {
      const current = await login();
      const refresh = await post("refresh", {}, current.cookie);
      assert.equal(refresh.status, 200);
      const refreshed = await refresh.json();
      const cookie = refresh.headers.get("set-cookie").split(";")[0];
      assert.equal((await getMe(current.data.accessToken)).status, 200);
      assert.equal((await getMe(refreshed.data.accessToken)).status, 200);
      assert.equal((await post("logout", {}, cookie)).status, 204);
      assert.equal((await getMe(current.data.accessToken)).status, 401);
      assert.equal((await getMe(refreshed.data.accessToken)).status, 401);
      assert.equal((await getMe(other.data.accessToken)).status, 200);
    },
  );

  await t.test("expired, revoked and deleted sessions deny otherwise valid tokens", async () => {
    for (const change of ["expired", "revoked", "deleted"]) {
      const current = await login();
      const where = { id: current.data.session.id };
      if (change === "deleted") await client.session.delete({ where });
      else
        await client.session.update({
          where,
          data:
            change === "expired"
              ? { expiresAt: new Date(Date.now() - 1000) }
              : { revokedAt: new Date() },
        });
      assert.equal((await getMe(current.data.accessToken)).status, 401);
    }
  });

  await t.test("a deleted user cannot be returned from JWT claims", async () => {
    const current = await login(emails[2]);
    await client.$transaction([
      client.walletBalance.deleteMany({ where: { userId: current.data.user.id } }),
      client.user.delete({ where: { id: current.data.user.id } }),
    ]);
    assert.equal((await getMe(current.data.accessToken)).status, 401);
  });

  await t.test("missing verification configuration returns a sanitized service error", async () => {
    delete process.env.JWT_ACCESS_SECRET;
    try {
      const response = await getMe(primary.data.accessToken);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "AUTH_UNAVAILABLE");
      assert.equal(response.headers.get("cache-control"), "no-store");
    } finally {
      process.env.JWT_ACCESS_SECRET = secret;
    }
  });
});
