import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  applyCurrentCandle,
  syncHistoricalCandles,
} = require("../.next/realtime-test/features/trading/components/chart/chart-data-sync.js");

function createChartHarness() {
  const setDataCalls = [];
  const updates = [];
  let fitContentCalls = 0;

  return {
    chart: {
      timeScale() {
        return {
          fitContent() {
            fitContentCalls += 1;
          },
        };
      },
    },
    get fitContentCalls() {
      return fitContentCalls;
    },
    series: {
      setData(candles) {
        setDataCalls.push(candles);
      },
      update(candle) {
        updates.push(candle);
      },
    },
    setDataCalls,
    updates,
  };
}

test("loads normalized historical candles into the series and fits the chart", () => {
  const harness = createChartHarness();
  const latestTime = syncHistoricalCandles(harness.chart, harness.series, [
    { close: "101.25", high: "102.5", low: "99.75", open: "100", time: 100, volume: "42" },
    { close: "103.5", high: "104", low: "100.25", open: "101.25", time: 160, volume: "24" },
  ]);

  assert.equal(latestTime, 160);
  assert.equal(harness.fitContentCalls, 1);
  assert.deepEqual(harness.setDataCalls, [
    [
      { close: 101.25, high: 102.5, low: 99.75, open: 100, time: 100 },
      { close: 103.5, high: 104, low: 100.25, open: 101.25, time: 160 },
    ],
  ]);
});

test("applies only current realtime candles after historical history has loaded", () => {
  const harness = createChartHarness();
  const staleApplied = applyCurrentCandle(
    harness.series,
    { close: "100", high: "101", low: "99", open: "100", time: 120, volume: "2" },
    160,
  );
  const currentApplied = applyCurrentCandle(
    harness.series,
    { close: "104", high: "105", low: "101", open: "103", time: 160, volume: "3" },
    160,
  );
  const nextApplied = applyCurrentCandle(
    harness.series,
    { close: "106", high: "107", low: "104", open: "104", time: 220, volume: "4" },
    160,
  );

  assert.equal(staleApplied, false);
  assert.equal(currentApplied, true);
  assert.equal(nextApplied, true);
  assert.deepEqual(harness.updates, [
    { close: 104, high: 105, low: 101, open: 103, time: 160 },
    { close: 106, high: 107, low: 104, open: 104, time: 220 },
  ]);
});
