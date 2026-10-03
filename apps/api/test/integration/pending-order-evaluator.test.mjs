import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { DatabaseModule } = require("../../dist/database/database.module.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const {
  PENDING_ORDER_EVALUATION_BATCH_SIZE,
  PendingOrderEvaluator,
} = require("../../dist/trading/pending-order-evaluator.service.js");

function ticker(price) {
  return {
    change24hPercent: "1",
    high24h: "110",
    low24h: "90",
    marketTs: 1_700_000_000_000,
    price,
    providerSequence: 1,
    symbol: "BTC-USD",
    type: "ticker",
    volume24h: "10",
  };
}

test("pending-order evaluator selects only LIMIT orders crossing the ticker price", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `pending-evaluator-${randomUUID()}`;
  const emails = [`${prefix}@example.com`, `${prefix}-other@example.com`];

  t.after(async () => {
    try {
      await client.$transaction([
        client.trade.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.order.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
      ]);
    } finally {
      await app.close();
    }
  });

  const [user, otherUser] = await Promise.all(
    emails.map((email) =>
      client.user.create({ data: { email, passwordHash: "not-used-by-this-evaluator-test" } }),
    ),
  );
  // Older foreign fixtures also detect isolation applied too late, after the bounded query.
  await client.order.createMany({
    data: Array.from({ length: PENDING_ORDER_EVALUATION_BATCH_SIZE + 1 }, () => ({
      baseAsset: "BTC",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      limitPrice: "100",
      quantity: "0.1",
      quoteAsset: "USD",
      reservedAmount: "10",
      reservedAsset: "USD",
      side: "BUY",
      status: "PENDING",
      symbol: "BTC-USD",
      type: "LIMIT",
      userId: otherUser.id,
    })),
  });
  const orders = await Promise.all([
    createLimitOrder(client, user.id, { limitPrice: "100", side: "BUY" }),
    createLimitOrder(client, user.id, { limitPrice: "90", side: "BUY" }),
    createLimitOrder(client, user.id, { limitPrice: "90", side: "SELL" }),
    createLimitOrder(client, user.id, { limitPrice: "100", side: "SELL" }),
    createLimitOrder(client, user.id, {
      limitPrice: "100",
      side: "BUY",
      status: "CANCELLED",
    }),
    createLimitOrder(client, user.id, {
      baseAsset: "ETH",
      limitPrice: "100",
      quoteAsset: "USD",
      side: "BUY",
      symbol: "ETH-USD",
    }),
  ]);
  // Production evaluation is global. Scope only this test client before ordering/take so
  // concurrent files' pending orders cannot enter or crowd out the fixture's result set.
  const fixtureClient = client.$extends({
    query: {
      order: {
        findMany({ args, query }) {
          return query({ ...args, where: { AND: [args.where ?? {}, { userId: user.id }] } });
        },
      },
    },
  });
  const evaluator = new PendingOrderEvaluator(
    { onEvent: () => () => {} },
    { client: fixtureClient },
    { retainProviderSubscription: () => () => {} },
  );

  const eligible = await evaluator.evaluateTicker(ticker("95"));

  assert.deepEqual(
    new Set(eligible.map(({ orderId }) => orderId)),
    new Set([orders[0].id, orders[2].id]),
  );
  assert.equal(await client.trade.count({ where: { user: { email: { in: emails } } } }), 0);
  assert.equal(await client.order.count({ where: { status: "PENDING", userId: user.id } }), 5);
  assert.equal(
    await client.order.count({ where: { status: "PENDING", userId: otherUser.id } }),
    PENDING_ORDER_EVALUATION_BATCH_SIZE + 1,
  );
});

function createLimitOrder(
  client,
  userId,
  {
    baseAsset = "BTC",
    limitPrice,
    quoteAsset = "USD",
    side,
    status = "PENDING",
    symbol = "BTC-USD",
  },
) {
  return client.order.create({
    data: {
      baseAsset,
      limitPrice,
      quantity: "0.1",
      quoteAsset,
      reservedAmount: side === "BUY" ? "10" : "0.1",
      reservedAsset: side === "BUY" ? quoteAsset : baseAsset,
      side,
      status,
      symbol,
      type: "LIMIT",
      userId,
    },
  });
}
