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
const { RefreshService } = require("../../dist/auth/refresh.service.js");
const { SessionService } = require("../../dist/auth/session.service.js");
const { LogoutService } = require("../../dist/auth/logout.service.js");
const { configureHttpApplication } = require("../../dist/config/http-application.js");

test("logout revocation on PostgreSQL", async (t) => {
  assert.ok(
    process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.endsWith("_test"),
  );
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const secret = randomBytes(32).toString("hex");
  process.env.JWT_ACCESS_SECRET = secret;
  const app = await NestFactory.create(AuthModule, { logger: false });
  const client = app.get(PrismaService).client;
  const email = `logout-${randomUUID()}@example.com`;
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
  const post = (route, body, cookie, accessToken, requestOrigin = origin) =>
    globalThis.fetch(`${base}/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const credentials = { email, password: "logout-test-password" };
  assert.equal((await post("register", credentials)).status, 201);
  const login = async () => {
    const response = await post("login", credentials);
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get("set-cookie").split(";")[0],
      data: (await response.json()).data,
    };
  };

  await t.test(
    "revokes the current session, preserves other sessions and funding, and is idempotent",
    async () => {
      const current = await login();
      const other = await login();
      const response = await post("logout", undefined, current.cookie);
      assert.equal(response.status, 204);
      assert.equal(await response.text(), "");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(
        response.headers.get("set-cookie"),
        /pulse_trade_refresh=; Path=\/api\/v1\/auth; Max-Age=0/,
      );
      const stored = await client.session.findUniqueOrThrow({
        where: { id: current.data.session.id },
      });
      assert.ok(stored.revokedAt);
      assert.equal((await post("refresh", {}, current.cookie)).status, 401);
      assert.equal((await post("refresh", {}, other.cookie)).status, 200);
      assert.equal((await post("logout", {}, current.cookie)).status, 204);
      const repeated = await client.session.findUniqueOrThrow({ where: { id: stored.id } });
      assert.equal(repeated.revokedAt.getTime(), stored.revokedAt.getTime());
      const wallet = await client.walletBalance.findFirstOrThrow({
        where: { user: { email }, asset: "USD" },
      });
      assert.equal(wallet.available.toString(), "10000");
      assert.equal(wallet.locked.toString(), "0");
    },
  );

  await t.test(
    "missing, malformed and unknown credentials clear the cookie without revoking other sessions",
    async () => {
      const current = await login();
      for (const cookie of [
        undefined,
        "pulse_trade_refresh=%ZZ",
        `pulse_trade_refresh=${randomBytes(32).toString("base64url")}`,
      ]) {
        const response = await post("logout", {}, cookie);
        assert.equal(response.status, 204);
        assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
      }
      assert.equal(
        (await client.session.findUniqueOrThrow({ where: { id: current.data.session.id } }))
          .revokedAt,
        null,
      );
    },
  );

  await t.test("expired sessions are revoked and cannot refresh", async () => {
    const current = await login();
    await client.session.update({
      where: { id: current.data.session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await post("logout", {}, current.cookie)).status, 204);
    assert.ok(
      (await client.session.findUniqueOrThrow({ where: { id: current.data.session.id } }))
        .revokedAt,
    );
  });

  await t.test(
    "untrusted origins and JSON identity injection cannot revoke a session",
    async () => {
      const current = await login();
      const injected = await post("logout", { sessionId: current.data.session.id }, current.cookie);
      assert.equal(injected.status, 400);
      assert.equal(injected.headers.get("set-cookie"), null);
      const forbidden = await post(
        "logout",
        {},
        current.cookie,
        undefined,
        "https://untrusted.example",
      );
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.headers.get("set-cookie"), null);
      assert.equal(
        (await client.session.findUniqueOrThrow({ where: { id: current.data.session.id } }))
          .revokedAt,
        null,
      );
    },
  );

  await t.test("a forged, wrong-audience or expired bearer cannot identify a session", async () => {
    const current = await login();
    for (const options of [
      { secret: randomBytes(32), audience: "pulse-trade-web", exp: "15m" },
      { secret: Buffer.from(secret), audience: "other-app", exp: "15m" },
      { secret: Buffer.from(secret), audience: "pulse-trade-web", exp: "-1m" },
    ]) {
      const token = await new SignJWT({ sid: current.data.session.id })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(current.data.user.id)
        .setIssuer("pulse-trade-api")
        .setAudience(options.audience)
        .setIssuedAt()
        .setExpirationTime(options.exp)
        .sign(options.secret);
      assert.equal((await post("logout", {}, undefined, token)).status, 204);
      assert.equal(
        (await client.session.findUniqueOrThrow({ where: { id: current.data.session.id } }))
          .revokedAt,
        null,
      );
    }
  });

  await t.test(
    "logout after rotation uses the verified bearer to revoke the stable session",
    async () => {
      const current = await login();
      const refreshed = await post("refresh", {}, current.cookie);
      assert.equal(refreshed.status, 200);
      const rotatedCookie = refreshed.headers.get("set-cookie").split(";")[0];
      assert.equal(
        (await post("logout", {}, current.cookie, current.data.accessToken)).status,
        204,
      );
      assert.equal((await post("refresh", {}, rotatedCookie)).status, 401);
      assert.ok(
        (await client.session.findUniqueOrThrow({ where: { id: current.data.session.id } }))
          .revokedAt,
      );
    },
  );

  await t.test("logout during refresh prevents its conditional update", async () => {
    const current = await login();
    const signer = app.get(SessionService);
    const logout = app.get(LogoutService);
    const refresh = new RefreshService(
      { client },
      {
        async signAccessToken(...args) {
          const token = await signer.signAccessToken(...args);
          await logout.logout(current.cookie.split("=")[1], undefined);
          return token;
        },
      },
    );
    await assert.rejects(
      refresh.refresh(current.cookie.split("=")[1]),
      (error) => error.getStatus() === 401,
    );
    assert.equal((await post("refresh", {}, current.cookie)).status, 401);
  });
});
