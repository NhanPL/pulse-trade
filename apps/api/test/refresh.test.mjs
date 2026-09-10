import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { readRefreshCookie, sessionCookie } = require("../dist/auth/session-cookie.js");
const { refreshRequestSchema } = require("@pulse-trade/contracts");
const { RefreshService } = require("../dist/auth/refresh.service.js");
const { AuthController } = require("../dist/auth/auth.controller.js");

test("reads only one well-formed refresh cookie and rejects ambiguous or malformed credentials", () => {
  const token = "a".repeat(43);
  assert.equal(readRefreshCookie(`other=x; pulse_trade_refresh=${token}; another=y`), token);
  for (const header of [
    undefined,
    "",
    "other=x",
    "pulse_trade_refresh=",
    "pulse_trade_refresh=%ZZ",
    "pulse_trade_refresh=short",
    `pulse_trade_refresh=${"a".repeat(44)}`,
    `pulse_trade_refresh=${token}; pulse_trade_refresh=${token}`,
  ]) {
    assert.equal(readRefreshCookie(header), undefined);
  }
  assert.equal(readRefreshCookie(`pulse_trade_refresh=${token.slice(0, 42)}%61`), token);
});

test("refresh accepts no body or an empty object, never a supplied identity or token", () => {
  assert.equal(refreshRequestSchema.safeParse(undefined).success, true);
  assert.equal(refreshRequestSchema.safeParse({}).success, true);
  for (const body of [null, [], { userId: "user" }, { refreshToken: "token" }]) {
    assert.equal(refreshRequestSchema.safeParse(body).success, false);
  }
});

test("missing cookie is rejected before accessing the database", async () => {
  const service = new RefreshService(
    {
      get client() {
        return assert.fail("DB must not be accessed");
      },
    },
    {},
  );
  await assert.rejects(
    service.refresh(undefined),
    (error) => error.getStatus() === 401 && error.getResponse().error.code === "INVALID_SESSION",
  );
});

test("database failures return a sanitized error", async () => {
  const service = new RefreshService(
    {
      client: {
        async $transaction() {
          throw new Error("sensitive query");
        },
      },
    },
    {},
  );
  await assert.rejects(service.refresh("a".repeat(43)), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().error.code, "REFRESH_UNAVAILABLE");
    assert.equal(JSON.stringify(error.getResponse()).includes("sensitive"), false);
    return true;
  });
});

test("refresh failure never overwrites a concurrently issued cookie", async () => {
  const service = new RefreshService({}, {});
  const controller = new AuthController({}, {}, service);
  const response = {
    setHeader() {
      assert.fail("must not clear or write cookie");
    },
  };
  await assert.rejects(
    controller.refresh({}, undefined, undefined, response),
    (error) => error.getStatus() === 401,
  );
});

test("rotated cookies preserve production flags and use the remaining session lifetime", () => {
  const cookie = sessionCookie("a".repeat(43), true, 30);
  assert.match(cookie, /Max-Age=30; HttpOnly; SameSite=Lax; Secure$/);
  assert.match(cookie, /Path=\/api\/v1\/auth/);
});
