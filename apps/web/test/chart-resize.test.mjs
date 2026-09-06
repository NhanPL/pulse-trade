import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  observeChartSize,
} = require("../.next/realtime-test/features/trading/components/chart/chart-resize.js");

test("resizes the chart on observed container changes and cleans up pending work", () => {
  const chart = {
    options: [],
    applyOptions(options) {
      this.options.push(options);
    },
  };
  const container = {
    rect: { height: 240.4, width: 480.4 },
    getBoundingClientRect() {
      return this.rect;
    },
  };
  const scheduled = [];
  const cancelled = [];
  let observer;

  const stop = observeChartSize(chart, container, {
    cancelFrame: (frame) => cancelled.push(frame),
    createObserver: (callback) => {
      observer = {
        callback,
        disconnected: false,
        observe(target) {
          this.target = target;
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      return observer;
    },
    requestFrame: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
  });

  assert.deepEqual(chart.options, [{ height: 240, width: 480 }]);
  assert.equal(observer.target, container);

  container.rect = { height: 320.2, width: 640.2 };
  observer.callback();
  observer.callback();
  assert.equal(scheduled.length, 1);
  scheduled[0](0);
  assert.deepEqual(chart.options.at(-1), { height: 320, width: 640 });

  observer.callback();
  stop();
  assert.equal(observer.disconnected, true);
  assert.deepEqual(cancelled, [2]);
});
