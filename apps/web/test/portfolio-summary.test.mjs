import assert from "node:assert/strict";
import test from "node:test";

import { presentSummaryValue } from "../src/features/portfolio/model/portfolio-summary.ts";

test("summary amounts use USD cents and P&L includes a sign as well as a color", () => {
  assert.deepEqual(presentSummaryValue("124638.57", false), {
    text: "$124,638.57",
    tone: "neutral",
  });
  assert.deepEqual(presentSummaryValue("3217.46", true), {
    text: "+$3,217.46",
    tone: "positive",
  });
  assert.deepEqual(presentSummaryValue("-162.9", true), {
    text: "-$162.90",
    tone: "negative",
  });
});

test("zero and amounts rounded to zero remain neutral rather than indicating a gain or loss", () => {
  for (const value of ["0", "0.00", "-0", "0.001", "-0.001"]) {
    assert.deepEqual(presentSummaryValue(value, true), { text: "$0.00", tone: "neutral" });
  }
  assert.equal(presentSummaryValue("0", false).text, "$0.00");
});

test("unavailable or invalid amounts are never presented as a zero balance", () => {
  for (const value of [null, "", " ", "NaN", "Infinity", "1e4", "1,000", "9".repeat(400)]) {
    assert.deepEqual(presentSummaryValue(value, true), { text: "—", tone: "neutral" });
  }
});

test("summary formatting preserves cents beyond the safe JavaScript integer range", () => {
  assert.deepEqual(presentSummaryValue("99999999999999999999.99", false), {
    text: "$99,999,999,999,999,999,999.99",
    tone: "neutral",
  });
  assert.deepEqual(presentSummaryValue("-99999999999999999999.995", true), {
    text: "-$100,000,000,000,000,000,000.00",
    tone: "negative",
  });
});
