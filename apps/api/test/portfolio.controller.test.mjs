import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { UnauthorizedException } = require("@nestjs/common");
const { portfolioResponseSchema } = require("@pulse-trade/contracts");
const { PortfolioController } = require("../dist/portfolio/portfolio.controller.js");

const user = { email: "portfolio@example.com", id: randomUUID() };
const snapshot = {
  quoteCurrency: "USD",
  cash: { available: "4500", locked: "1000" },
  positions: [{ asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" }],
};

function createController({ currentUser, portfolio } = {}) {
  return new PortfolioController(
    currentUser ?? {
      async resolve() {
        return user;
      },
    },
    portfolio ?? {
      async getSnapshot() {
        return snapshot;
      },
    },
  );
}

test("portfolio contract keeps persisted financial values as strict decimal strings", () => {
  assert.deepEqual(portfolioResponseSchema.parse({ data: snapshot }), { data: snapshot });

  for (const invalid of [
    { data: { ...snapshot, quoteCurrency: "EUR" } },
    { data: { ...snapshot, cash: { available: "-1", locked: "0" } } },
    { data: { ...snapshot, positions: [{ ...snapshot.positions[0], realizedPnl: "1e2" }] } },
    { data: { ...snapshot, positions: [{ ...snapshot.positions[0], asset: "btc" }] } },
    { data: { ...snapshot, injected: true } },
  ]) {
    assert.equal(portfolioResponseSchema.safeParse(invalid).success, false);
  }
});

test("resolves the authenticated user before loading only that portfolio", async () => {
  const calls = [];
  const controller = createController({
    currentUser: {
      async resolve(authorization) {
        calls.push({ authorization, operation: "authenticate" });
        return user;
      },
    },
    portfolio: {
      async getSnapshot(userId) {
        calls.push({ operation: "portfolio", userId });
        return snapshot;
      },
    },
  });

  assert.deepEqual(await controller.getPortfolio("Bearer access-token"), { data: snapshot });
  assert.deepEqual(calls, [
    { authorization: "Bearer access-token", operation: "authenticate" },
    { operation: "portfolio", userId: user.id },
  ]);
});

test("does not read a portfolio when authentication fails", async () => {
  const controller = createController({
    currentUser: {
      async resolve() {
        throw new UnauthorizedException({
          error: { code: "UNAUTHENTICATED", details: null, message: "Authentication is required." },
        });
      },
    },
    portfolio: {
      async getSnapshot() {
        assert.fail("must not read a portfolio");
      },
    },
  });

  await assert.rejects(controller.getPortfolio(undefined), (error) => {
    assert.equal(error.getStatus(), 401);
    assert.equal(error.getResponse().error.code, "UNAUTHENTICATED");
    return true;
  });
});
