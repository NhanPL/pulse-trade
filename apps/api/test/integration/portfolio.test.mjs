import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const { PortfolioModule } = require("../../dist/portfolio/portfolio.module.js");
const { configureHttpApplication } = require("../../dist/config/http-application.js");
const { portfolioResponseSchema } = require("@pulse-trade/contracts");

test("portfolio endpoint returns the authenticated user's persisted snapshot", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const originalSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  const app = await NestFactory.create(PortfolioModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `portfolio-${randomUUID()}`;
  const emails = [`${prefix}@example.com`, `${prefix}-other@example.com`];
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  t.after(async () => {
    try {
      await client.$transaction([
        client.trade.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.order.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.position.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.walletBalance.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
      ]);
    } finally {
      await app.close();
      if (originalSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = originalSecret;
    }
  });

  configureHttpApplication(app, { nodeEnv: "test", port: 3001, webOrigin: origin });
  await app.listen(0, "127.0.0.1");
  const base = `${await app.getUrl()}/api/v1`;
  const postAuth = (route, body) =>
    globalThis.fetch(`${base}/auth/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  const getPortfolio = (accessToken, query = "") =>
    globalThis.fetch(`${base}/portfolio${query}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  const register = async (email) => {
    const response = await postAuth("register", { email, password: "portfolio-password" });
    assert.equal(response.status, 201);
    return (await response.json()).data.user;
  };
  const login = async (email) => {
    const response = await postAuth("login", { email, password: "portfolio-password" });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };

  const primary = await register(emails[0]);
  const other = await register(emails[1]);
  const session = await login(emails[0]);
  await client.$transaction([
    client.walletBalance.update({
      where: { userId_asset: { asset: "USD", userId: primary.id } },
      data: { available: "4500", locked: "1000" },
    }),
    client.walletBalance.create({
      data: { asset: "BTC", available: "0.05", locked: "0", userId: primary.id },
    }),
    client.position.createMany({
      data: [
        {
          asset: "BTC",
          averageCostUsd: "60000",
          quantity: "0.05",
          realizedPnlUsd: "100",
          userId: primary.id,
        },
        {
          asset: "ETH",
          averageCostUsd: "0",
          quantity: "0",
          realizedPnlUsd: "-25",
          userId: primary.id,
        },
        {
          asset: "SOL",
          averageCostUsd: "150",
          quantity: "2",
          realizedPnlUsd: "999",
          userId: other.id,
        },
      ],
    }),
  ]);

  await t.test("serializes only the caller's cash and persisted positions", async () => {
    const response = await getPortfolio(session.accessToken, `?userId=${other.id}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    portfolioResponseSchema.parse(body);
    assert.deepEqual(body, {
      data: {
        quoteCurrency: "USD",
        cash: { available: "4500", locked: "1000" },
        positions: [
          { asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" },
          // Closed positions remain so later realized-P&L aggregation retains their history.
          { asset: "ETH", averageCost: "0", quantity: "0", realizedPnl: "-25" },
        ],
      },
    });
  });

  await t.test("requires a verified bearer token before reading a portfolio", async () => {
    for (const token of [undefined, "not-a-token"]) {
      const response = await getPortfolio(token);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: { code: "UNAUTHENTICATED", details: null, message: "Authentication is required." },
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });
});
