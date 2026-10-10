import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { Test } = require("@nestjs/testing");
const { WsAdapter } = require("@nestjs/platform-ws");
const { AppModule } = require("../dist/app.module.js");
const { PrismaService } = require("../dist/database/prisma.service.js");
const { HealthController } = require("../dist/health/health.controller.js");
const { HealthModule } = require("../dist/health/health.module.js");
const { configureHttpApplication } = require("../dist/config/http-application.js");
const { MARKET_DATA_PROVIDER } = require("../dist/markets/provider/market-data-provider.js");
const { parseRealtimeMessage } = require("../dist/realtime/realtime-message-parser.js");

const expectedBody = { data: { status: "ok" } };
const webOrigin = "http://localhost:3000";
const secret = "P06_PRIVATE_PASSWORD_TOKEN_COOKIE_QUERY";

async function startServer(t, imports) {
  const module = await Test.createTestingModule({ imports }).compile();
  const app = module.createNestApplication({ logger: false });
  t.after(() => app.close());
  configureHttpApplication(app, { nodeEnv: "test", port: 3001, webOrigin });
  await app.listen(0, "127.0.0.1");
  return `http://127.0.0.1:${app.getHttpServer().address().port}`;
}

test("process health has a fixed, fresh payload without dependency injections", () => {
  const controller = new HealthController();
  const first = controller.getHealth();
  assert.deepEqual(first, expectedBody);
  first.data.status = "tampered";
  assert.deepEqual(controller.getHealth(), expectedBody);
  assert.equal(HealthController.length, 0);
});

test("real public health route uses the API prefix, JSON/no-store and server request correlation", async (t) => {
  const base = await startServer(t, [HealthModule]);
  const response = await globalThis.fetch(`${base}/api/v1/health`, {
    headers: { origin: webOrigin },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expectedBody);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), webOrigin);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(response.headers.get("access-control-expose-headers"), "X-Request-ID");
  assert.match(response.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
  assert.equal(response.headers.get("set-cookie"), null);
  const root = await globalThis.fetch(`${base}/health`);
  assert.equal(root.status, 404);
  await root.text();
});

test("health responses never echo caller credentials, query parameters or request IDs", async (t) => {
  const base = await startServer(t, [HealthModule]);
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      globalThis.fetch(`${base}/api/v1/health?token=${secret}&databaseUrl=${secret}`, {
        headers: {
          authorization: `Bearer ${secret}`,
          cookie: `refresh=${secret}`,
          "x-request-id": secret,
        },
      }),
    ),
  );
  const ids = new Set();
  for (const response of responses) {
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), expectedBody);
    assert.equal((body + JSON.stringify([...response.headers])).includes(secret), false);
    assert.equal(response.headers.get("set-cookie"), null);
    ids.add(response.headers.get("x-request-id"));
  }
  assert.equal(ids.size, 10);
});

test("health supports normal HEAD and CORS preflight without creating sessions", async (t) => {
  const base = await startServer(t, [HealthModule]);
  const head = await globalThis.fetch(`${base}/api/v1/health`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("cache-control"), "no-store");
  assert.equal(head.headers.get("set-cookie"), null);
  const options = await globalThis.fetch(`${base}/api/v1/health`, {
    method: "OPTIONS",
    headers: { origin: webOrigin, "access-control-request-method": "GET" },
  });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), webOrigin);
  assert.equal(options.headers.get("set-cookie"), null);
  await options.text();
});

test("AppModule exposes liveness with failed market connection and unusable DB without weakening private APIs", async (t) => {
  let databaseReads = 0;
  const prisma = {
    get client() {
      databaseReads++;
      throw new Error("PRIVATE_DATABASE_CREDENTIAL");
    },
  };
  const counts = { connect: 0, history: 0, subscribe: 0, close: 0 };
  const eventListeners = new Set();
  const stateListeners = new Set();
  const provider = {
    async connect() {
      counts.connect++;
      throw new Error("PRIVATE_PROVIDER_ENDPOINT");
    },
    async close() {
      counts.close++;
    },
    async getHistoricalCandles() {
      counts.history++;
      throw new Error("PRIVATE_PROVIDER_SECRET");
    },
    subscribe() {
      counts.subscribe++;
    },
    unsubscribe() {},
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onConnectionState(listener) {
      stateListeners.add(listener);
      listener({ state: "DISCONNECTED", ts: 0 });
      return () => stateListeners.delete(listener);
    },
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(MARKET_DATA_PROVIDER)
    .useValue(provider)
    .compile();
  const app = module.createNestApplication({ logger: false });
  t.after(async () => {
    await app.close();
    assert.equal(eventListeners.size, 0);
    assert.equal(stateListeners.size, 0);
    assert.equal(counts.close, 1);
  });
  configureHttpApplication(app, { nodeEnv: "test", port: 3001, webOrigin });
  app.useWebSocketAdapter(new WsAdapter(app, { messageParser: parseRealtimeMessage }));
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  assert.equal(counts.connect, 1);
  assert.equal(databaseReads, 0);
  const startupCounts = { ...counts };
  for (let index = 0; index < 3; index++) {
    const health = await globalThis.fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), expectedBody);
  }
  assert.deepEqual(counts, startupCounts);
  assert.equal(databaseReads, 0);
  const orders = await globalThis.fetch(`${base}/orders`);
  assert.equal(orders.status, 401);
  assert.equal((await orders.json()).error.code, "UNAUTHENTICATED");
  assert.equal(databaseReads, 0);
});
