import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import process from "node:process";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { AuthModule } = require("../../dist/auth/auth.module.js");
const { RegistrationService } = require("../../dist/auth/registration.service.js");
const { PasswordHashService } = require("../../dist/auth/password-hash.service.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");

test("registration and funding on PostgreSQL", async (t) => {
  const url = process.env.DATABASE_URL;
  assert.ok(
    url && new URL(url).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.create(AuthModule, { logger: false });
  const client = app.get(PrismaService).client;
  const passwords = app.get(PasswordHashService);
  const prefix = `registration-${randomUUID()}`;
  const email = `${prefix}@example.com`;
  const rollbackEmail = `${prefix}-rollback@example.com`;
  const emails = [email, rollbackEmail];
  t.after(async () => {
    try {
      await client.$transaction([
        client.walletBalance.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
      ]);
    } finally {
      await app.close();
    }
  });
  app.setGlobalPrefix("api/v1");
  await app.listen(0, "127.0.0.1");
  const endpoint = `${await app.getUrl()}/api/v1/auth/register`;
  const post = (body) =>
    globalThis.fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  await t.test(
    "concurrent normalized registrations fund exactly one wallet; retries do not fund again",
    async () => {
      const responses = await Promise.all([
        post({ email: ` ${email.toUpperCase()} `, password: "test-password" }),
        post({ email, password: "test-password" }),
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
      const success = await responses.find((response) => response.status === 201).json();
      const user = await client.user.findUniqueOrThrow({
        where: { email },
        include: { walletBalances: true, sessions: true },
      });
      assert.deepEqual(success, { data: { user: { id: user.id, email } } });
      assert.equal(await passwords.verify("test-password", user.passwordHash), true);
      assert.equal(user.sessions.length, 0);
      assert.equal(user.walletBalances.length, 1);
      assert.equal(user.walletBalances[0].asset, "USD");
      assert.equal(user.walletBalances[0].available.toString(), "10000");
      assert.equal(user.walletBalances[0].locked.toString(), "0");
      const retry = await post({ email, password: "test-password" });
      assert.equal(retry.status, 409);
      assert.equal((await retry.json()).error.code, "EMAIL_ALREADY_REGISTERED");
      const balances = await client.walletBalance.findMany({ where: { userId: user.id } });
      assert.equal(balances.length, 1);
      assert.equal(balances[0].available.toString(), "10000");
    },
  );

  await t.test("a database failure while funding rolls back the newly created user", async () => {
    // Violate the real PostgreSQL CHECK constraint after user.create succeeds.
    const failingClient = client.$extends({
      query: {
        walletBalance: {
          create({ args, query }) {
            return query({ ...args, data: { ...args.data, available: "-1" } });
          },
        },
      },
    });
    const service = new RegistrationService({ client: failingClient }, passwords);
    await assert.rejects(
      service.register({ email: rollbackEmail, password: "test-password" }),
      (error) => error.getStatus() === 503,
    );
    assert.equal(await client.user.count({ where: { email: rollbackEmail } }), 0);
    assert.equal(
      await client.walletBalance.count({ where: { user: { email: rollbackEmail } } }),
      0,
    );
  });

  await t.test("invalid requests cannot create a user or choose their own funding", async () => {
    const response = await post({
      email: rollbackEmail,
      password: "test-password",
      available: "999999",
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_REGISTRATION");
    assert.equal(await client.user.count({ where: { email: rollbackEmail } }), 0);
  });
});
