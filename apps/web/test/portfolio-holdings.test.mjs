import assert from "node:assert/strict";
import test from "node:test";

import { filterHoldingPreviews } from "../src/features/portfolio/model/holding-preview.ts";

const holdings = [
  { asset: "BTC", name: "Bitcoin", isSmallBalance: false },
  { asset: "ETH", name: "Ethereum", isSmallBalance: false },
  { asset: "DOGE", name: "Dogecoin", isSmallBalance: true },
];

test("searches holdings by asset symbol or name without changing their order", () => {
  assert.deepEqual(
    filterHoldingPreviews(holdings, "  eth  ", false).map((holding) => holding.asset),
    ["ETH"],
  );
  assert.deepEqual(
    filterHoldingPreviews(holdings, "coin", false).map((holding) => holding.asset),
    ["BTC", "DOGE"],
  );
});

test("hides only positions explicitly marked as small balances", () => {
  assert.deepEqual(
    filterHoldingPreviews(holdings, "", true).map((holding) => holding.asset),
    ["BTC", "ETH"],
  );
  assert.deepEqual(
    filterHoldingPreviews(holdings, "", false).map((holding) => holding.asset),
    ["BTC", "ETH", "DOGE"],
  );
});
