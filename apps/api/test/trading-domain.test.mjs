import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  TradingDomainError,
  addDecimals,
  calculateQuoteAmount,
  calculateWeightedAverageCost,
  compareDecimals,
  divideDecimals,
  multiplyDecimals,
  normalizeFinancialDecimal,
  subtractDecimals,
} = require("../dist/trading/domain/decimal.js");
const {
  calculatePositionAfterBuy,
  calculatePositionAfterSell,
  calculateUnrealizedPnl,
} = require("../dist/trading/domain/position-calculations.js");

test("performs financial decimal arithmetic without binary floating-point drift", () => {
  assert.equal(addDecimals("0.1", "0.2"), "0.3");
  assert.equal(subtractDecimals("10000", "9999.99"), "0.01");
  assert.equal(multiplyDecimals("67542.31", "0.01"), "675.4231");
  assert.equal(divideDecimals("1", "3"), "0.333333333333333333");
  assert.equal(divideDecimals("1", "2000000000000000000"), "0.000000000000000001");
  assert.equal(normalizeFinancialDecimal("-0.000000000000000000"), "0");
  assert.equal(compareDecimals("0.010", "0.01"), 0);
});

test("rejects values that cannot be stored as authoritative financial decimals", () => {
  for (const value of [" 1", "1e3", "+1", "01", "0.0000000000000000001"]) {
    assert.throws(() => normalizeFinancialDecimal(value), TradingDomainError);
  }
  assert.throws(() => normalizeFinancialDecimal("100000000000000000000"), TradingDomainError);
  assert.throws(() => compareDecimals("100000000000000000000", "1"), TradingDomainError);
  assert.equal(calculateQuoteAmount("0.000000000000000001", "0.5"), "0.000000000000000001");
  assert.throws(() => calculateQuoteAmount("0.000000000000000001", "0.1"), /too small to persist/);
});

test("calculates market quote amounts and weighted-average position cost", () => {
  const bought = calculatePositionAfterBuy(
    { quantity: "1", averageCostUsd: "50000", realizedPnlUsd: "20" },
    "1",
    "60000",
  );
  assert.deepEqual(bought, {
    quantity: "2",
    averageCostUsd: "55000",
    realizedPnlUsd: "20",
  });
  assert.equal(calculateQuoteAmount("67542.31", "0.01"), "675.4231");
  assert.equal(
    calculateWeightedAverageCost("0.1", "0.000000000000000001", "0.1", "0.000000000000000005"),
    "0.000000000000000003",
  );
});

test("updates realized P&L on sell, resets cost basis on close, and derives unrealized P&L", () => {
  const partial = calculatePositionAfterSell(
    { quantity: "2", averageCostUsd: "55000", realizedPnlUsd: "20" },
    "0.5",
    "70000",
  );
  assert.deepEqual(partial, {
    proceeds: "35000",
    realizedPnlDelta: "7500",
    position: { quantity: "1.5", averageCostUsd: "55000", realizedPnlUsd: "7520" },
  });
  assert.equal(calculateUnrealizedPnl(partial.position, "54000"), "-1500");

  const closed = calculatePositionAfterSell(partial.position, "1.5", "50000");
  assert.deepEqual(closed.position, {
    quantity: "0",
    averageCostUsd: "0",
    realizedPnlUsd: "20",
  });
  assert.throws(
    () => calculatePositionAfterSell(partial.position, "1.500000000000000001", "50000"),
    /exceeds the current position quantity/,
  );
});
