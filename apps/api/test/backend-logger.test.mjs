import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  BackendLogger,
  REALTIME_LOG_INTERVAL_MS,
} = require("../dist/observability/backend-logger.js");
const { StructuredNestLogger } = require("../dist/observability/nest-logger.js");
const { requestContext } = require("../dist/observability/request-context.js");
const { createHttpLoggingMiddleware } = require("../dist/observability/http-logging.js");

function recorder(context = "http", options = {}) {
  const lines = [];
  const logger = new BackendLogger(context, {
    now: () => Date.parse("2026-10-10T00:00:00.000Z"),
    ...options,
    write: (line, level) => lines.push({ line, level, record: JSON.parse(line) }),
  });
  return { lines, logger };
}

test("writes JSON lines with stable fields and reconstructs only safe metadata", () => {
  const { lines, logger } = recorder("OrdersController");
  const requestId = randomUUID();
  const orderId = randomUUID();
  requestContext.run({ requestId }, () =>
    logger.error("orders.cancel_failed", {
      orderId,
      errorCode: "ORDER_UNAVAILABLE",
      status: 503,
      symbol: "BTC-USD",
      orderSide: "BUY",
      orderType: "LIMIT",
      password: "SECRET_PASSWORD",
      authorization: "SECRET_TOKEN",
      cookie: "SECRET_COOKIE",
      userId: "PRIVATE_USER",
      quantity: "PRIVATE_QUANTITY",
      requestId: "FORGED_ID",
      event: "FORGED_EVENT",
      body: { email: "PRIVATE_EMAIL" },
    }),
  );
  assert.deepEqual(lines[0].record, {
    timestamp: "2026-10-10T00:00:00.000Z",
    level: "error",
    service: "pulse-trade-api",
    context: "OrdersController",
    event: "orders.cancel_failed",
    requestId,
    orderId,
    status: 503,
    symbol: "BTC-USD",
    orderSide: "BUY",
    orderType: "LIMIT",
    errorCode: "ORDER_UNAVAILABLE",
  });
  assert.equal(lines[0].level, "error");
  assert.equal(lines[0].line.includes("\n"), false);
  assert.equal(requestContext.getStore(), undefined);
});

test("rejects unknown events, unsafe values and non-finite metadata", () => {
  const { logger, lines } = recorder();
  logger.info("SECRET_UNKNOWN_EVENT");
  requestContext.run({ requestId: "SECRET_REQUEST_ID" }, () =>
    logger.info("http.request_completed", {
      method: "SECRET_METHOD",
      route: "/auth?password=SECRET",
      status: Infinity,
      durationMs: -1,
      port: NaN,
      orderId: "SECRET_ORDER",
      connectionId: "SECRET_CONNECTION",
      channel: "SECRET_CHANNEL",
      interval: "SECRET_INTERVAL",
      errorCode: "SECRET_ERROR",
      frameworkContext: "SECRET_CONTEXT",
      symbol: "SECRET_SYMBOL",
      providerState: "SECRET_STATE",
    }),
  );
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(lines[0].record), [
    "timestamp",
    "level",
    "service",
    "context",
    "event",
  ]);
  assert.equal(lines[0].line.includes("SECRET"), false);
});

test("retains bounded app stack coordinates without messages, function names or host paths", () => {
  const { logger, lines } = recorder();
  const source = fileURLToPath(new URL("../dist/trading/orders.controller.js", import.meta.url));
  const error = new Error("SECRET_PASSWORD postgres://SECRET_CREDENTIAL user@example.com");
  error.name = "SECRET_ERROR_NAME";
  error.cause = { token: "SECRET_CAUSE" };
  error.stack = [
    error.message,
    "    at SECRET_FUNCTION (https://SECRET_HOST/file.js:1:2)",
    "    at SECRET_FUNCTION (node:internal/process/task_queues:1:2)",
    "    at SECRET_FUNCTION (/outside/SECRET_PATH.ts:1:2)",
    ...Array.from({ length: 20 }, () => `    at SECRET_FUNCTION (${source}:42:7)`),
  ].join("\n");
  logger.error("http.unexpected_error", {}, error);
  assert.equal(lines[0].record.error.stack.split("\n").length, 11);
  assert.equal(
    lines[0].record.error.stack.includes("dist/trading/orders.controller.js:42:7"),
    true,
  );
  assert.equal(lines[0].line.includes("SECRET"), false);
  assert.equal(lines[0].line.includes(source), false);
});

test("bounds noisy feed errors by event without retaining payload/symbol/order keyed caches", () => {
  let now = 0;
  const { logger, lines } = recorder("CoinbaseProvider", { now: () => now });
  for (let index = 0; index < 100_000; index++) {
    logger.warn("provider.invalid_message", { symbol: `SECRET_${index}` });
    logger.error("orders.fill_failed", { orderId: randomUUID() }, new Error("SECRET_PAYLOAD"));
  }
  assert.equal(lines.length, 2);
  assert.equal(logger.noisyWindows.size, 2);
  now = REALTIME_LOG_INTERVAL_MS;
  logger.warn("provider.invalid_message");
  assert.equal(lines[2].record.suppressed, 99_999);
  assert.equal(lines[2].line.includes("SECRET"), false);
  logger.warn("provider.reconnect_scheduled", { attempt: 1, delayMs: 1000 });
  logger.warn("provider.reconnect_scheduled", { attempt: 2, delayMs: 2000 });
  assert.equal(lines.length, 5);
});

test("isolates concurrent request context across awaits and does not leak to background logs", async () => {
  const { logger, lines } = recorder();
  const ids = [randomUUID(), randomUUID()];
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const calls = ids.map((requestId) =>
    requestContext.run({ requestId }, async () => {
      await barrier;
      logger.info("http.request_completed");
    }),
  );
  release();
  await Promise.all(calls);
  logger.info("provider.state_changed", { providerState: "CONNECTED" });
  assert.deepEqual(
    lines.slice(0, 2).map(({ record }) => record.requestId),
    ids,
  );
  assert.equal(lines[2].record.requestId, undefined);
});

test("framework adapter discards raw strings/objects/stack arguments and ignores debug payloads", () => {
  const { logger, lines } = recorder("framework");
  const adapter = new StructuredNestLogger(logger);
  adapter.log({ password: "SECRET" }, "InstanceLoader");
  adapter.warn("SECRET", "NestApplication");
  adapter.error(new Error("SECRET"), "SECRET_STACK", "ExceptionsHandler");
  adapter.fatal({ authorization: "SECRET" }, "SECRET_CONTEXT");
  adapter.debug("SECRET");
  adapter.verbose("SECRET");
  assert.deepEqual(
    lines.map(({ record }) => record.event),
    ["framework.log", "framework.warn", "framework.error", "framework.fatal"],
  );
  assert.equal(lines[0].record.frameworkContext, "InstanceLoader");
  assert.equal(lines[3].record.frameworkContext, undefined);
  assert.equal(JSON.stringify(lines).includes("SECRET"), false);
});

test("diagnostic sink or unsafe getter failures never throw into application code", () => {
  const logger = new BackendLogger("http", {
    write: () => {
      throw new Error("sink offline");
    },
  });
  assert.doesNotThrow(() =>
    logger.error("http.unexpected_error", {}, new Error("business failure")),
  );
  assert.doesNotThrow(() =>
    logger.warn("http.request_completed", {
      get status() {
        throw new Error("unsafe metadata");
      },
    }),
  );
});

test("malformed stacks cannot prevent a safe error record from being written", () => {
  const { logger, lines } = recorder();
  const error = new Error("SECRET");
  error.stack = "SECRET\n    at fn (file:///SECRET%invalid.js:1:2)";
  logger.error("http.unexpected_error", {}, error);
  Object.defineProperty(error, "stack", {
    get() {
      throw new Error("SECRET");
    },
  });
  logger.error("http.unexpected_error", {}, error);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].record.error, { kind: "exception" });
  assert.equal(JSON.stringify(lines).includes("SECRET"), false);
});

class FakeResponse extends EventEmitter {
  statusCode = 200;
  writableFinished = false;
  headers = new Map();
  setHeader(name, value) {
    this.headers.set(name, value);
  }
}

test("completion and premature-close paths log once and remove both response listeners", () => {
  const { logger, lines } = recorder();
  const middleware = createHttpLoggingMiddleware(logger);
  for (const aborted of [false, true]) {
    const response = new FakeResponse();
    middleware(
      { method: "POST", url: "/SECRET?token=SECRET", headers: { "x-request-id": "SECRET" } },
      response,
      () => {
        assert.equal(requestContext.getStore().requestId, response.headers.get("X-Request-ID"));
      },
    );
    if (aborted) response.emit("close");
    else {
      response.writableFinished = true;
      response.emit("finish");
      response.emit("close");
    }
    assert.equal(response.listenerCount("finish"), 0);
    assert.equal(response.listenerCount("close"), 0);
  }
  assert.equal(lines.length, 2);
  assert.equal(lines[0].record.event, "http.request_completed");
  assert.equal(lines[0].record.route, "unmatched");
  assert.equal(lines[1].record.event, "http.request_aborted");
  assert.equal(lines[1].record.status, undefined);
  assert.equal(JSON.stringify(lines).includes("SECRET"), false);
});
