import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { registerRequestSchema } = require("@pulse-trade/contracts");
const { AuthController } = require("../dist/auth/auth.controller.js");
const { RegistrationService } = require("../dist/auth/registration.service.js");

test("normalizes email without changing password and rejects invalid or extra fields", () => {
  assert.deepEqual(
    registerRequestSchema.parse({ email: " User@Example.com ", password: "  password  " }),
    {
      email: "user@example.com",
      password: "  password  ",
    },
  );
  for (const body of [
    null,
    {},
    { email: "bad", password: "password" },
    { email: "u@example.com", password: "short" },
    { email: "u@example.com", password: "x".repeat(129) },
    { email: "u@example.com", password: "password", available: "999999" },
  ]) {
    assert.equal(registerRequestSchema.safeParse(body).success, false);
  }
});

test("rejects invalid HTTP input before invoking registration", () => {
  const controller = new AuthController({
    register() {
      assert.fail("must not register");
    },
  });
  assert.throws(
    () => controller.register({ email: "bad", password: "secret" }),
    (error) => {
      assert.equal(error.getStatus(), 400);
      assert.equal(error.getResponse().error.code, "INVALID_REGISTRATION");
      assert.equal(JSON.stringify(error.getResponse()).includes("secret"), false);
      return true;
    },
  );
});

test("hashing failure never begins a transaction and returns a sanitized error", async () => {
  const service = new RegistrationService(
    {
      client: {
        $transaction() {
          assert.fail("must not begin a transaction");
        },
      },
    },
    {
      async hash() {
        throw new Error("sensitive internal detail");
      },
    },
  );
  await assert.rejects(
    service.register({ email: "u@example.com", password: "password" }),
    (error) => {
      assert.equal(error.getStatus(), 503);
      assert.equal(error.getResponse().error.code, "REGISTRATION_UNAVAILABLE");
      assert.equal(JSON.stringify(error.getResponse()).includes("sensitive"), false);
      return true;
    },
  );
});
