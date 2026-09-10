import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { LogoutService } = require("../dist/auth/logout.service.js");
const { AuthController } = require("../dist/auth/auth.controller.js");
const { clearSessionCookie } = require("../dist/auth/session-cookie.js");
const { logoutRequestSchema } = require("@pulse-trade/contracts");

test("logout accepts only an empty body and rejects client-supplied identity", () => {
  assert.equal(logoutRequestSchema.safeParse(undefined).success, true);
  assert.equal(logoutRequestSchema.safeParse({}).success, true);
  for (const body of [
    null,
    [],
    { userId: "victim" },
    { sessionId: "victim" },
    { token: "token" },
  ]) {
    assert.equal(logoutRequestSchema.safeParse(body).success, false);
  }
});

test("logout without usable credentials succeeds without a database", async () => {
  const service = new LogoutService({
    get client() {
      return assert.fail("must not access DB");
    },
  });
  await service.logout(undefined, undefined);
  await service.logout(undefined, "invalid");
});

test("logout revokes only the matched session and does not depend on the pre-rotation hash", async () => {
  let update;
  const service = new LogoutService({
    client: {
      session: {
        async findUnique() {
          return { id: "session-a", userId: "user-a" };
        },
        async updateMany(input) {
          update = input;
          return { count: 1 };
        },
      },
    },
  });
  await service.logout("a".repeat(43), undefined);
  assert.deepEqual(update.where, { id: "session-a", userId: "user-a", revokedAt: null });
  assert.ok(update.data.revokedAt instanceof Date);
});

test("storage failure is sanitized and does not clear the browser credential", async () => {
  const service = new LogoutService({
    client: {
      session: {
        async findUnique() {
          throw new Error("database secret");
        },
      },
    },
  });
  const controller = new AuthController({}, {}, {}, service);
  await assert.rejects(
    controller.logout({}, undefined, `pulse_trade_refresh=${"a".repeat(43)}`, undefined, {
      setHeader() {
        assert.fail("must not clear cookie");
      },
    }),
    (error) => {
      assert.equal(error.getStatus(), 503);
      assert.equal(error.getResponse().error.code, "LOGOUT_UNAVAILABLE");
      assert.equal(JSON.stringify(error.getResponse()).includes("database secret"), false);
      return true;
    },
  );
});

test("clearing the refresh cookie matches its scope and expires it immediately", () => {
  const cookie = clearSessionCookie(true);
  assert.match(cookie, /^pulse_trade_refresh=; Path=\/api\/v1\/auth; Max-Age=0;/);
  assert.match(cookie, /HttpOnly; SameSite=Lax; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT$/);
  assert.equal(clearSessionCookie(false).includes("Secure"), false);
});
