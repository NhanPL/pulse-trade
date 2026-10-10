import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import { setImmediate } from "node:timers/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const { BadRequestException, Controller, Get, Module, Param } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const { configureHttpApplication } = require("../dist/config/http-application.js");
const { BackendLogger } = require("../dist/observability/backend-logger.js");
const { requestContext } = require("../dist/observability/request-context.js");
const { OrdersController } = require("../dist/trading/orders.controller.js");
const { CurrentUserService } = require("../dist/auth/current-user.service.js");
const { MarketBuyService } = require("../dist/trading/market-buy.service.js");
const { MarketSellService } = require("../dist/trading/market-sell.service.js");
const { LimitBuyService } = require("../dist/trading/limit-buy.service.js");
const { LimitSellService } = require("../dist/trading/limit-sell.service.js");
const { OrderCancellationService } = require("../dist/trading/order-cancellation.service.js");
const { OrderCancellationError } = require("../dist/trading/order-cancellation.error.js");
const { OrdersQueryService } = require("../dist/trading/orders-query.service.js");
const { PendingOrderEvaluator } = require("../dist/trading/pending-order-evaluator.service.js");

const secret = "P05_SECRET_password_token_cookie_email_financial_sql";

class LoggingTestController {
  unexpected() {
    throw new Error(secret);
  }
  libraryFailure() {
    throw { statusCode: 503, message: secret };
  }
  validation() {
    throw new BadRequestException({
      error: { code: "INVALID_ORDER", message: "Invalid order.", details: null },
    });
  }
  async market(symbol) {
    await setImmediate();
    new BackendLogger("MarketService").warn("market.history_failed", { symbol });
    return { data: { requestId: requestContext.getStore().requestId, symbol } };
  }
}
Controller("logging-test")(LoggingTestController);
for (const [name, route] of [
  ["unexpected", "unexpected"],
  ["libraryFailure", "library-failure"],
  ["validation", "validation"],
  ["market", ":symbol"],
]) {
  Get(route)(
    LoggingTestController.prototype,
    name,
    Object.getOwnPropertyDescriptor(LoggingTestController.prototype, name),
  );
}
Param("symbol")(LoggingTestController.prototype, "market", 0);

class LoggingTestModule {}
Module({
  controllers: [LoggingTestController, OrdersController],
  providers: [
    { provide: CurrentUserService, useValue: { resolve: async () => ({ id: randomUUID() }) } },
    {
      provide: MarketBuyService,
      useValue: {
        execute: async () => {
          throw new Error(secret);
        },
      },
    },
    { provide: MarketSellService, useValue: {} },
    { provide: LimitBuyService, useValue: {} },
    { provide: LimitSellService, useValue: {} },
    {
      provide: OrderCancellationService,
      useValue: {
        cancel: async () => {
          throw new OrderCancellationError("ORDER_NOT_CANCELLABLE", secret);
        },
      },
    },
    {
      provide: OrdersQueryService,
      useValue: { list: async () => ({ items: [], nextCursor: null }) },
    },
  ],
})(LoggingTestModule);

function captureLogs(t) {
  const records = [];
  const lines = [];
  for (const stream of [process.stdout, process.stderr]) {
    const originalWrite = stream.write.bind(stream);
    t.mock.method(stream, "write", (chunk, ...args) => {
      const line = String(chunk);
      if (!line.startsWith("{")) return originalWrite(chunk, ...args);
      lines.push(line);
      records.push(JSON.parse(line));
      return true;
    });
  }
  return { records, lines };
}

async function server(t) {
  const app = await NestFactory.create(LoggingTestModule, { logger: false });
  t.after(() => app.close());
  configureHttpApplication(app, {
    nodeEnv: "test",
    port: 3001,
    webOrigin: "http://localhost:3000",
  });
  await app.listen(0, "127.0.0.1");
  return `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
}

test("real HTTP requests expose server IDs, correlate async logs and retain only matched routes", async (t) => {
  const base = await server(t);
  const { records, lines } = captureLogs(t);
  const responses = await Promise.all(
    ["BTC-USD", "ETH-USD"].map((symbol) =>
      globalThis.fetch(`${base}/logging-test/${symbol}?password=${secret}`, {
        headers: {
          authorization: `Bearer ${secret}`,
          cookie: `refresh=${secret}`,
          "x-request-id": secret,
        },
      }),
    ),
  );
  const bodies = await Promise.all(responses.map((response) => response.json()));
  const ids = responses.map((response) => response.headers.get("x-request-id"));
  assert.equal(new Set(ids).size, 2);
  ids.forEach((id, index) => {
    assert.match(id, /^[a-f0-9-]{36}$/);
    assert.equal(bodies[index].data.requestId, id);
    const correlated = records.filter((record) => record.requestId === id);
    assert.deepEqual(
      correlated.map(({ event }) => event),
      ["market.history_failed", "http.request_completed"],
    );
    const completed = correlated[1];
    assert.equal(completed.route, "/api/v1/logging-test/:symbol");
    assert.equal(completed.method, "GET");
    assert.equal(completed.status, 200);
    assert.ok(completed.durationMs >= 0);
  });
  assert.equal(lines.join("").includes(secret), false);
  assert.equal(requestContext.getStore(), undefined);

  const preflight = await globalThis.fetch(`${base}/orders`, {
    method: "OPTIONS",
    headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
  });
  assert.equal(preflight.status, 204);
  assert.ok(preflight.headers.get("x-request-id"));
  const cors = await globalThis.fetch(`${base}/orders`, {
    headers: { origin: "http://localhost:3000" },
  });
  assert.equal(cors.headers.get("access-control-expose-headers"), "X-Request-ID");
  await cors.json();

  const missing = await globalThis.fetch(`${base}/UNKNOWN_${secret}?cookie=${secret}`);
  assert.equal(missing.status, 404);
  await missing.text();
  assert.equal(
    records.find((record) => record.requestId === missing.headers.get("x-request-id")).route,
    "unmatched",
  );
  assert.equal(lines.join("").includes(secret), false);
  const library = await globalThis.fetch(`${base}/logging-test/library-failure`);
  assert.equal(library.status, 503);
  assert.deepEqual(await library.json(), { statusCode: 503, message: "Internal server error" });
  assert.equal(lines.join("").includes(secret), false);
});

test("unexpected exceptions and validation retain HTTP behavior without leaking raw error payloads", async (t) => {
  const base = await server(t);
  const { records, lines } = captureLogs(t);
  const invalid = await globalThis.fetch(`${base}/logging-test/validation`);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    error: { code: "INVALID_ORDER", message: "Invalid order.", details: null },
  });
  const unknown = await globalThis.fetch(`${base}/logging-test/unexpected`);
  assert.equal(unknown.status, 500);
  assert.deepEqual(await unknown.json(), { statusCode: 500, message: "Internal server error" });
  const id = unknown.headers.get("x-request-id");
  assert.deepEqual(
    records.filter(({ requestId }) => requestId === id).map(({ event }) => event),
    ["http.unexpected_error", "http.request_completed"],
  );
  assert.equal(
    records.find(({ requestId }) => requestId === invalid.headers.get("x-request-id")).level,
    "warn",
  );
  assert.equal(lines.join("").includes(secret), false);
});

test("actual order failures carry HTTP correlation/cancellation order ID and preserve safe envelopes", async (t) => {
  const base = await server(t);
  const { records, lines } = captureLogs(t);
  const response = await globalThis.fetch(`${base}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ quantity: "0.01", side: "BUY", symbol: "BTC-USD", type: "MARKET" }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "ORDER_UNAVAILABLE");
  const failed = records.find(({ event }) => event === "orders.create_failed");
  assert.equal(failed.requestId, response.headers.get("x-request-id"));
  assert.equal(failed.orderType, "MARKET");
  assert.equal(failed.orderSide, "BUY");
  assert.equal(failed.errorCode, "ORDER_UNAVAILABLE");
  assert.equal(failed.orderId, undefined);
  assert.ok(failed.error.stack.includes("dist/trading/orders.controller.js"));
  const orderId = randomUUID();
  const cancellation = await globalThis.fetch(`${base}/orders/${orderId}/cancel`, {
    method: "POST",
  });
  assert.equal(cancellation.status, 409);
  assert.equal((await cancellation.json()).error.code, "ORDER_NOT_CANCELLABLE");
  const cancelLog = records.find(({ event }) => event === "orders.cancel_failed");
  assert.equal(cancelLog.orderId, orderId);
  assert.equal(cancelLog.requestId, cancellation.headers.get("x-request-id"));
  const completed = records.find(
    ({ event, requestId }) =>
      event === "http.request_completed" && requestId === cancelLog.requestId,
  );
  assert.equal(completed.route, "/api/v1/orders/:id/cancel");
  assert.equal(completed.route.includes(orderId), false);
  assert.equal(lines.join("").includes(secret), false);
  assert.equal(lines.join("").includes('"quantity"'), false);
});

test("background fill failures retain order ID but no user, financial values or exception message", async (t) => {
  const { records, lines } = captureLogs(t);
  const evaluator = new PendingOrderEvaluator({}, {}, {}, {});
  evaluator.onEligibleOrder(() => {
    throw new Error(secret);
  });
  const orderId = randomUUID();
  await evaluator.emitEligibleOrder({
    orderId,
    limitPrice: "PRIVATE_LIMIT",
    marketPrice: "PRIVATE_PRICE",
    marketTs: 0,
    side: "BUY",
    symbol: "BTC-USD",
    userId: "PRIVATE_USER",
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].event, "orders.fill_failed");
  assert.equal(records[0].orderId, orderId);
  assert.equal(records[0].requestId, undefined);
  assert.equal(lines.join("").includes(secret), false);
  assert.equal(lines.join("").includes("PRIVATE"), false);
  evaluator.onModuleDestroy();
});
