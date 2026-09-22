import assert from "node:assert/strict";
import test from "node:test";

import { presentCashBalance } from "../src/features/portfolio/model/cash-balance.ts";

test("shows the available, reserved, and total USD balance separately", () => {
  assert.deepEqual(presentCashBalance({ available: "4000", locked: "6000.00" }), {
    available: "$4,000.00",
    locked: "$6,000.00",
    total: "$10,000.00",
    availablePercent: 40,
    lockedPercent: 60,
    hasCash: true,
  });
});

test("adds mixed-scale decimals exactly and rounds only the final USD display", () => {
  assert.deepEqual(presentCashBalance({ available: "0.1", locked: "0.2000" }), {
    available: "$0.10",
    locked: "$0.20",
    total: "$0.30",
    availablePercent: 33.33,
    lockedPercent: 66.67,
    hasCash: true,
  });
  assert.equal(presentCashBalance({ available: "0.004", locked: "0.004" }).total, "$0.01");
  assert.equal(presentCashBalance({ available: "0.005", locked: "0" }).available, "$0.01");
});

test("preserves cents and carries beyond the safe floating-point integer range", () => {
  const balance = presentCashBalance({ available: "99999999999999999999.99", locked: "0.01" });
  assert.equal(balance.available, "$99,999,999,999,999,999,999.99");
  assert.equal(balance.locked, "$0.01");
  assert.equal(balance.total, "$100,000,000,000,000,000,000.00");
});

test("zero cash has no allocation while fully available or locked cash has the correct share", () => {
  assert.deepEqual(presentCashBalance({ available: "0", locked: "0.00" }), {
    available: "$0.00",
    locked: "$0.00",
    total: "$0.00",
    availablePercent: 0,
    lockedPercent: 0,
    hasCash: false,
  });
  const available = presentCashBalance({ available: "18642.30", locked: "0" });
  assert.equal(available.availablePercent, 100);
  assert.equal(available.lockedPercent, 0);
  assert.equal(available.hasCash, true);
  const locked = presentCashBalance({ available: "0", locked: "18642.30" });
  assert.equal(locked.availablePercent, 0);
  assert.equal(locked.lockedPercent, 100);
  assert.equal(locked.hasCash, true);
});

test("allocation shares stay bounded and sum to 100 even at a rounding tie", () => {
  const balance = presentCashBalance({ available: "1.0001", locked: "0.9999" });
  assert.equal(balance.availablePercent, 50.01);
  assert.equal(balance.lockedPercent, 49.99);
  assert.equal(balance.availablePercent + balance.lockedPercent, 100);
  const tiny = presentCashBalance({ available: "0.000000000000000001", locked: "0" });
  assert.equal(tiny.hasCash, true);
  assert.equal(tiny.availablePercent, 100);
});

test("missing, negative, malformed or out-of-range balances never become a false zero total", () => {
  assert.equal(presentCashBalance(null), null);
  for (const value of [
    "",
    " ",
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "1,000",
    "01",
    "100000000000000000000",
    "0.0000000000000000001",
  ]) {
    assert.equal(presentCashBalance({ available: value, locked: "100" }), null);
    assert.equal(presentCashBalance({ available: "100", locked: value }), null);
  }
});
