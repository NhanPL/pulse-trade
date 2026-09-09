import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { loginRequestSchema } = require("@pulse-trade/contracts");
const { LoginService } = require("../dist/auth/login.service.js");
const { sessionCookie } = require("../dist/auth/session-cookie.js");
const { environmentSchema } = require("../dist/config/env.schema.js");

test("login normalizes only email and rejects malformed or injected fields", () => {
  assert.deepEqual(loginRequestSchema.parse({ email: " User@Example.com ", password: " x " }), {
    email: "user@example.com",
    password: " x ",
  });
  for (const input of [
    null,
    {},
    { email: "bad", password: "password" },
    { email: "u@example.com", password: "" },
    { email: "u@example.com", password: "x".repeat(129) },
    { email: "u@example.com", password: "password", userId: "injected" },
  ]) {
    assert.equal(loginRequestSchema.safeParse(input).success, false);
  }
});

test("wrong password and missing user have the same error and never create a session", async () => {
  const responses = [];
  let verifications = 0;
  for (const user of [{ id: "user", email: "u@example.com", passwordHash: "stored" }, null]) {
    const service = new LoginService(
      {
        client: {
          user: {
            async findUnique() {
              return user;
            },
          },
        },
      },
      {
        async hash() {
          return "dummy";
        },
        async verify() {
          verifications++;
          return false;
        },
      },
      {
        create() {
          assert.fail("must not create session");
        },
      },
    );
    await assert.rejects(service.login({ email: "u@example.com", password: "wrong" }), (error) => {
      assert.equal(error.getStatus(), 401);
      responses.push(error.getResponse());
      return true;
    });
  }
  assert.equal(verifications, 2);
  assert.deepEqual(responses[0], responses[1]);
  assert.equal(responses[0].error.code, "INVALID_CREDENTIALS");
});

test("database failure is sanitized and does not create a session", async () => {
  const service = new LoginService(
    {
      client: {
        user: {
          async findUnique() {
            throw new Error("database secret");
          },
        },
      },
    },
    {},
    {
      create() {
        assert.fail("must not create session");
      },
    },
  );
  await assert.rejects(service.login({ email: "u@example.com", password: "password" }), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().error.code, "LOGIN_UNAVAILABLE");
    assert.equal(JSON.stringify(error.getResponse()).includes("database secret"), false);
    return true;
  });
});

test("refresh cookies are HttpOnly, path scoped and Secure in production", () => {
  const local = sessionCookie("test-token", false);
  const production = sessionCookie("test-token", true);
  assert.match(local, /Path=\/api\/v1\/auth; Max-Age=604800; HttpOnly; SameSite=Lax$/);
  assert.equal(production, `${local}; Secure`);
  assert.equal(production.includes("Domain="), false);
});

test("configured access-token secrets must be at least 32 characters", () => {
  assert.equal(environmentSchema.safeParse({ JWT_ACCESS_SECRET: "short" }).success, false);
  assert.equal(environmentSchema.safeParse({ JWT_ACCESS_SECRET: "x".repeat(32) }).success, true);
});
