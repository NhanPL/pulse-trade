import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { Controller, Get, Module } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const { configureHttpApplication } = require("../dist/config/http-application.js");

class HealthController {
  health() {
    return { ok: true };
  }
}
Controller("health")(HealthController);
Get()(
  HealthController.prototype,
  "health",
  Object.getOwnPropertyDescriptor(HealthController.prototype, "health"),
);

class HttpApplicationTestModule {}
Module({ controllers: [HealthController] })(HttpApplicationTestModule);

test("allows the configured web origin to read public API responses", async (t) => {
  const app = await NestFactory.create(HttpApplicationTestModule, { logger: false });
  t.after(() => app.close());

  configureHttpApplication(app, {
    nodeEnv: "development",
    port: 3001,
    webOrigin: "http://localhost:3000",
  });

  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address();
  const response = await globalThis.fetch(`http://127.0.0.1:${port}/api/v1/health`, {
    headers: {
      "access-control-request-method": "GET",
      origin: "http://localhost:3000",
    },
    method: "OPTIONS",
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
});
