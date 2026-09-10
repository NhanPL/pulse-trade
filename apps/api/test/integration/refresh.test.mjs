import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import test from "node:test";
import { jwtVerify } from "jose";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { AuthModule } = require("../../dist/auth/auth.module.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const { RefreshService } = require("../../dist/auth/refresh.service.js");
const { SessionService } = require("../../dist/auth/session.service.js");
const { configureHttpApplication } = require("../../dist/config/http-application.js");
const { refreshResponseSchema } = require("@pulse-trade/contracts");
const tokenHash = (cookie) => createHash("sha256").update(cookie.split("=")[1]).digest("hex");
const responseCookie = (response) => response.headers.get("set-cookie").split(";")[0];

test("refresh rotation on PostgreSQL", async (t) => {
  assert.ok(
    process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.endsWith("_test"),
  );
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const secret = randomBytes(32).toString("hex");
  process.env.JWT_ACCESS_SECRET = secret;
  const app = await NestFactory.create(AuthModule, { logger: false });
  const client = app.get(PrismaService).client;
  const sessions = app.get(SessionService);
  const email = `refresh-${randomUUID()}@example.com`;
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  t.after(async () => {
    try {
      await client.$transaction([
        client.walletBalance.deleteMany({ where: { user: { email } } }),
        client.user.deleteMany({ where: { email } }),
      ]);
    } finally {
      await app.close();
      if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = oldSecret;
    }
  });
  configureHttpApplication(app, { nodeEnv: "test", port: 3001, webOrigin: origin });
  await app.listen(0, "127.0.0.1");
  const base = `${await app.getUrl()}/api/v1/auth`;
  const post = (route, body, cookie, requestOrigin = origin) =>
    globalThis.fetch(`${base}/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const credentials = { email, password: "refresh-test-password" };
  assert.equal((await post("register", credentials)).status, 201);
  const login = async () => {
    const response = await post("login", credentials);
    assert.equal(response.status, 200);
    return { cookie: responseCookie(response), data: (await response.json()).data };
  };

  await t.test(
    "refresh replaces the hash, issues a signed JWT, keeps expiry and rejects replay",
    async () => {
      const initial = await login();
      const before = await client.session.findUniqueOrThrow({
        where: { id: initial.data.session.id },
      });
      const response = await post("refresh", undefined, initial.cookie);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      const rotatedCookie = responseCookie(response);
      assert.notEqual(rotatedCookie, initial.cookie);
      const body = await response.json();
      refreshResponseSchema.parse(body);
      assert.equal(JSON.stringify(body).includes(rotatedCookie.split("=")[1]), false);
      assert.deepEqual(body.data.user, initial.data.user);
      assert.deepEqual(body.data.session, initial.data.session);
      assert.notEqual(body.data.accessToken, initial.data.accessToken);
      const verified = await jwtVerify(body.data.accessToken, Buffer.from(secret), {
        algorithms: ["HS256"],
        issuer: "pulse-trade-api",
        audience: "pulse-trade-web",
      });
      assert.equal(verified.payload.sub, initial.data.user.id);
      assert.equal(verified.payload.sid, before.id);
      assert.equal(verified.payload.exp - verified.payload.iat, body.data.expiresIn);
      const stored = await client.session.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(stored.refreshTokenHash, tokenHash(rotatedCookie));
      assert.notEqual(stored.refreshTokenHash, before.refreshTokenHash);
      assert.equal(stored.expiresAt.getTime(), before.expiresAt.getTime());
      assert.ok(stored.lastUsedAt);
      const replay = await post("refresh", {}, initial.cookie);
      assert.equal(replay.status, 401);
      assert.equal((await replay.json()).error.code, "INVALID_SESSION");
      assert.equal(replay.headers.get("set-cookie"), null);
      assert.equal((await post("refresh", {}, rotatedCookie)).status, 200);
    },
  );

  await t.test("concurrent uses of one token allow exactly one rotation", async () => {
    const initial = await login();
    const responses = await Promise.all([
      post("refresh", {}, initial.cookie),
      post("refresh", {}, initial.cookie),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);
    const winner = responses.find((response) => response.status === 200);
    const loser = responses.find((response) => response.status === 401);
    assert.equal(loser.headers.get("set-cookie"), null);
    const stored = await client.session.findUniqueOrThrow({
      where: { id: initial.data.session.id },
    });
    assert.equal(stored.refreshTokenHash, tokenHash(responseCookie(winner)));
    assert.equal((await post("refresh", {}, responseCookie(winner))).status, 200);
  });

  await t.test("revocation after reading a session prevents the conditional rotation", async () => {
    const initial = await login();
    const service = new RefreshService(
      { client },
      {
        async signAccessToken(...args) {
          const jwt = await sessions.signAccessToken(...args);
          await client.session.update({
            where: { id: initial.data.session.id },
            data: { revokedAt: new Date() },
          });
          return jwt;
        },
      },
    );
    await assert.rejects(
      service.refresh(initial.cookie.split("=")[1]),
      (error) => error.getStatus() === 401,
    );
    const stored = await client.session.findUniqueOrThrow({
      where: { id: initial.data.session.id },
    });
    assert.equal(stored.refreshTokenHash, tokenHash(initial.cookie));
    assert.equal(stored.lastUsedAt, null);
    assert.ok(stored.revokedAt);
  });

  await t.test("failure after updating the hash rolls back the rotation", async () => {
    const initial = await login();
    const failingClient = client.$extends({
      query: {
        session: {
          async updateMany({ args, query }) {
            await query(args);
            throw new Error("Injected transaction failure");
          },
        },
      },
    });
    const service = new RefreshService({ client: failingClient }, sessions);
    await assert.rejects(
      service.refresh(initial.cookie.split("=")[1]),
      (error) => error.getStatus() === 503,
    );
    const stored = await client.session.findUniqueOrThrow({
      where: { id: initial.data.session.id },
    });
    assert.equal(stored.refreshTokenHash, tokenHash(initial.cookie));
    assert.equal(stored.lastUsedAt, null);
    assert.equal((await post("refresh", {}, initial.cookie)).status, 200);
  });

  await t.test("expired and revoked sessions cannot rotate", async () => {
    for (const change of [{ expiresAt: new Date(Date.now() - 1000) }, { revokedAt: new Date() }]) {
      const initial = await login();
      await client.session.update({ where: { id: initial.data.session.id }, data: change });
      const response = await post("refresh", {}, initial.cookie);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("set-cookie"), null);
      const stored = await client.session.findUniqueOrThrow({
        where: { id: initial.data.session.id },
      });
      assert.equal(stored.refreshTokenHash, tokenHash(initial.cookie));
      assert.equal(stored.lastUsedAt, null);
    }
  });

  await t.test("near-expiry tokens and cookies do not extend the session", async () => {
    const initial = await login();
    const expiresAt = new Date((Math.floor(Date.now() / 1000) + 60) * 1000);
    await client.session.update({ where: { id: initial.data.session.id }, data: { expiresAt } });
    const response = await post("refresh", {}, initial.cookie);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.data.expiresIn > 0 && body.data.expiresIn <= 60);
    const { payload } = await jwtVerify(body.data.accessToken, Buffer.from(secret));
    assert.equal(payload.exp, expiresAt.getTime() / 1000);
    assert.equal(body.data.session.expiresAt, expiresAt.toISOString());
    const maxAge = Number(response.headers.get("set-cookie").match(/Max-Age=(\d+)/)[1]);
    assert.ok(maxAge > 0 && maxAge <= 60);
  });

  await t.test("signing failure leaves the old credential usable", async () => {
    const initial = await login();
    delete process.env.JWT_ACCESS_SECRET;
    try {
      const response = await post("refresh", {}, initial.cookie);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "REFRESH_UNAVAILABLE");
      assert.equal(response.headers.get("set-cookie"), null);
      const stored = await client.session.findUniqueOrThrow({
        where: { id: initial.data.session.id },
      });
      assert.equal(stored.refreshTokenHash, tokenHash(initial.cookie));
      assert.equal(stored.lastUsedAt, null);
    } finally {
      process.env.JWT_ACCESS_SECRET = secret;
    }
    assert.equal((await post("refresh", {}, initial.cookie)).status, 200);
  });

  await t.test(
    "missing, unknown, malformed, duplicate cookies and forbidden origins fail safely",
    async () => {
      const initial = await login();
      for (const cookie of [
        undefined,
        "pulse_trade_refresh=%ZZ",
        `pulse_trade_refresh=${randomBytes(32).toString("base64url")}`,
        `${initial.cookie}; ${initial.cookie}`,
      ]) {
        const response = await post("refresh", {}, cookie);
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("set-cookie"), null);
      }
      assert.equal(
        (await post("refresh", { userId: initial.data.user.id }, initial.cookie)).status,
        400,
      );
      const forbidden = await post("refresh", {}, initial.cookie, "https://untrusted.example");
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.headers.get("set-cookie"), null);
      assert.equal((await post("refresh", {}, initial.cookie)).status, 200);
      const balance = await client.walletBalance.findFirstOrThrow({
        where: { user: { email }, asset: "USD" },
      });
      assert.equal(balance.available.toString(), "10000");
      assert.equal(balance.locked.toString(), "0");
    },
  );
});
