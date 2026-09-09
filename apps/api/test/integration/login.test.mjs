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
const { configureHttpApplication } = require("../../dist/config/http-application.js");
const { loginResponseSchema } = require("@pulse-trade/contracts");

test("login persists a session and issues credentials on PostgreSQL", async (t) => {
  assert.ok(
    process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.endsWith("_test"),
  );
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  const secret = process.env.JWT_ACCESS_SECRET;
  const app = await NestFactory.create(AuthModule, { logger: false });
  const client = app.get(PrismaService).client;
  const email = `login-${randomUUID()}@example.com`;
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
  const post = (route, body, requestOrigin = origin) =>
    globalThis.fetch(`${base}/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        "User-Agent": "login-integration-test",
      },
      body: JSON.stringify(body),
    });
  assert.equal((await post("register", { email, password: "  test-password 🔐  " })).status, 201);

  await t.test(
    "valid login returns a verifiable JWT and only a hash is stored for the cookie credential",
    async () => {
      const response = await post("login", {
        email: ` ${email.toUpperCase()} `,
        password: "  test-password 🔐  ",
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      const body = await response.json();
      loginResponseSchema.parse(body);
      assert.deepEqual(Object.keys(body.data).sort(), [
        "accessToken",
        "expiresIn",
        "session",
        "tokenType",
        "user",
      ]);
      const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\/api\/v1\/auth/);
      const rawToken = cookie.split(";")[0].split("=")[1];
      assert.equal(JSON.stringify(body).includes(rawToken), false);
      const session = await client.session.findUniqueOrThrow({
        where: { id: body.data.session.id },
      });
      assert.equal(session.userId, body.data.user.id);
      assert.equal(session.revokedAt, null);
      assert.equal(session.lastUsedAt, null);
      assert.equal(session.userAgent, "login-integration-test");
      assert.equal(session.refreshTokenHash, createHash("sha256").update(rawToken).digest("hex"));
      assert.notEqual(session.refreshTokenHash, rawToken);
      assert.equal(session.expiresAt.toISOString(), body.data.session.expiresAt);
      const verified = await jwtVerify(body.data.accessToken, Buffer.from(secret), {
        algorithms: ["HS256"],
        issuer: "pulse-trade-api",
        audience: "pulse-trade-web",
      });
      assert.equal(verified.payload.sub, session.userId);
      assert.equal(verified.payload.sid, session.id);
      assert.equal(verified.payload.exp - verified.payload.iat, 900);
      assert.equal(body.data.expiresIn, 900);
      assert.equal(Math.floor(session.expiresAt.getTime() / 1000) - verified.payload.iat, 604800);
      await assert.rejects(
        jwtVerify(body.data.accessToken, randomBytes(32), { algorithms: ["HS256"] }),
      );
    },
  );

  await t.test(
    "bad credentials and nonexistent accounts return identical errors without sessions",
    async () => {
      const before = await client.session.count({ where: { user: { email } } });
      const wrong = await post("login", { email, password: "test-password 🔐" });
      const absent = await post("login", {
        email: `absent-${randomUUID()}@example.com`,
        password: "wrong",
      });
      assert.equal(wrong.status, 401);
      assert.equal(absent.status, 401);
      assert.deepEqual(await wrong.json(), await absent.json());
      assert.equal(wrong.headers.get("set-cookie"), null);
      assert.equal(absent.headers.get("set-cookie"), null);
      assert.equal(await client.session.count({ where: { user: { email } } }), before);
    },
  );

  await t.test(
    "invalid input and cross-origin login are rejected before creating a session",
    async () => {
      const before = await client.session.count({ where: { user: { email } } });
      const bad = await post("login", { email, password: "", userId: "injected" });
      assert.equal(bad.status, 400);
      const crossOrigin = await post(
        "login",
        { email, password: "  test-password 🔐  " },
        "https://untrusted.example",
      );
      assert.equal(crossOrigin.status, 403);
      assert.equal(crossOrigin.headers.get("set-cookie"), null);
      assert.equal(await client.session.count({ where: { user: { email } } }), before);
    },
  );

  await t.test(
    "missing signing configuration fails without creating a session or cookie",
    async () => {
      const before = await client.session.count({ where: { user: { email } } });
      delete process.env.JWT_ACCESS_SECRET;
      try {
        const response = await post("login", { email, password: "  test-password 🔐  " });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error.code, "LOGIN_UNAVAILABLE");
        assert.equal(response.headers.get("set-cookie"), null);
        assert.equal(await client.session.count({ where: { user: { email } } }), before);
      } finally {
        process.env.JWT_ACCESS_SECRET = secret;
      }
    },
  );
});
