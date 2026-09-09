import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { AuthModule } = require("../dist/auth/auth.module.js");
const { PasswordHashService } = require("../dist/auth/password-hash.service.js");
const passwords = new PasswordHashService();

test("provides the password hasher through the auth module", async (t) => {
  const app = await NestFactory.createApplicationContext(AuthModule, { logger: false });
  t.after(() => app.close());
  assert.ok(app.get(PasswordHashService) instanceof PasswordHashService);
});

test("stores a salted Argon2id hash that fits the user password_hash column", async () => {
  const password = "paper-trading-password";
  const first = await passwords.hash(password);
  const second = await passwords.hash(password);

  const [, algorithm, version, parameters] = first.split("$");
  assert.equal(algorithm, "argon2id");
  assert.equal(version, "v=19");
  assert.deepEqual(Object.fromEntries(parameters.split(",").map((pair) => pair.split("="))), {
    m: "19456",
    t: "2",
    p: "1",
  });
  assert.ok(first.length <= 255);
  assert.notEqual(first, password);
  assert.notEqual(first, second);
  assert.equal(await passwords.verify(password, first), true);
  assert.equal(await passwords.verify(password, second), true);
  assert.equal(await passwords.verify("wrong-password", first), false);
});

test("preserves Unicode, whitespace and the full password beyond 72 bytes", async () => {
  const password = `  Mật khẩu 🔐 ${"a".repeat(80)}X  `;
  const storedHash = await passwords.hash(password);

  assert.equal(await passwords.verify(password, storedHash), true);
  assert.equal(await passwords.verify(password.trim(), storedHash), false);
  assert.equal(await passwords.verify(password.replace("X", "Y"), storedHash), false);
});

test("fails closed for empty, plaintext, unsupported and malformed stored hashes", async () => {
  for (const storedHash of [
    "",
    "plaintext-password",
    "$bcrypt$invalid",
    "$argon2id$",
    "$argon2id$v=19$m=19456,t=2,p=1$bad$bad",
  ]) {
    assert.equal(await passwords.verify("password", storedHash), false);
  }
});
