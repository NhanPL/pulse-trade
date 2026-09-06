import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  resolveChartDataState,
} = require("../.next/realtime-test/features/trading/components/chart/chart-data-state.js");

test("resolves loading while the initial chart history request is pending", () => {
  assert.equal(
    resolveChartDataState({ candleCount: undefined, isError: false, isPending: true }),
    "loading",
  );
});

test("resolves an error state only when no chart history is available", () => {
  assert.equal(
    resolveChartDataState({ candleCount: undefined, isError: true, isPending: false }),
    "error",
  );
  assert.equal(
    resolveChartDataState({ candleCount: 24, isError: true, isPending: false }),
    "ready",
  );
});

test("resolves empty and ready states from the returned candle count", () => {
  assert.equal(
    resolveChartDataState({ candleCount: 0, isError: false, isPending: false }),
    "empty",
  );
  assert.equal(
    resolveChartDataState({ candleCount: 24, isError: false, isPending: false }),
    "ready",
  );
});
