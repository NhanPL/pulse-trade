import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  createPortfolioHoldings,
  filterHoldings,
  portfolioTickerSymbols,
} = require("../.next/realtime-test/features/portfolio/model/holding.js");
const {
  allocationPercent,
  cashTotalUnits,
  formatHoldingQuantity,
  formatPnlUnits,
  formatUsdDecimal,
  formatUsdUnits,
  holdingUnrealizedPnlPercent,
  holdingUnrealizedPnlUnits,
  holdingsMarketValueUnits,
  holdingsUnrealizedPnlPercent,
  holdingsUnrealizedPnlUnits,
  multiplyDecimalUnits,
  positionsRealizedPnlUnits,
  smallBalanceAssetKey,
  totalPortfolioValueUnits,
  unitsToDecimalString,
} = require("../.next/realtime-test/features/portfolio/model/portfolio-valuation.js");

const positions = [
  { asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" },
  { asset: "ETH", averageCost: "3000", quantity: "2", realizedPnl: "0" },
  { asset: "ADA", averageCost: "0.5", quantity: "0.000000", realizedPnl: "-2" },
];

const tickers = {
  "BTC-USD": { price: "67542.31" },
  "ETH-USD": { price: "3482.67" },
};

test("creates holdings only for nonzero positions and derives unique ticker symbols", () => {
  const holdings = createPortfolioHoldings(positions, "USD");
  assert.deepEqual(
    holdings.map(({ asset, name, symbol }) => ({ asset, name, symbol })),
    [
      { asset: "BTC", name: "Bitcoin", symbol: "BTC-USD" },
      { asset: "ETH", name: "Ethereum", symbol: "ETH-USD" },
    ],
  );
  assert.deepEqual(portfolioTickerSymbols([...holdings, holdings[0]]), ["BTC-USD", "ETH-USD"]);
});

test("filters account holdings by name, symbol, and the current small-balance set", () => {
  const holdings = createPortfolioHoldings(positions, "USD");
  assert.deepEqual(
    filterHoldings(holdings, "  eth  ", false, new Set()).map((holding) => holding.asset),
    ["ETH"],
  );
  assert.deepEqual(
    filterHoldings(holdings, "coin", false, new Set()).map((holding) => holding.asset),
    ["BTC"],
  );
  assert.deepEqual(
    filterHoldings(holdings, "", true, new Set(["ETH"])).map((holding) => holding.asset),
    ["BTC"],
  );
});

test("combines position quantities with ticker prices using decimal arithmetic", () => {
  const holdings = createPortfolioHoldings(positions, "USD");
  const btcValue = multiplyDecimalUnits("0.05", "67542.31");
  assert.equal(formatUsdUnits(btcValue), "$3,377.12");
  assert.equal(formatUsdUnits(holdingsMarketValueUnits(holdings, tickers)), "$10,342.46");
  assert.equal(allocationPercent(holdings[0], holdings, tickers), "32.65%");
  assert.equal(
    formatUsdUnits(
      totalPortfolioValueUnits({ available: "4000", locked: "1000" }, holdings, tickers),
    ),
    "$15,342.46",
  );
});

test("requires every held asset price before presenting a combined valuation", () => {
  const holdings = createPortfolioHoldings(positions, "USD");
  assert.equal(formatPnlUnits(holdingsUnrealizedPnlUnits([], {})), "$0.00");
  assert.equal(holdingsUnrealizedPnlPercent([], {}), null);
  assert.equal(holdingsMarketValueUnits(holdings, { "BTC-USD": tickers["BTC-USD"] }), null);
  assert.equal(
    totalPortfolioValueUnits({ available: "4000", locked: "1000" }, holdings, {
      "BTC-USD": tickers["BTC-USD"],
    }),
    null,
  );
  assert.equal(holdingsUnrealizedPnlUnits(holdings, { "BTC-USD": tickers["BTC-USD"] }), null);
  assert.equal(holdingsUnrealizedPnlPercent(holdings, { "BTC-USD": tickers["BTC-USD"] }), null);
});

test("derives live unrealized profit and loss from cost basis without floating point", () => {
  const holdings = createPortfolioHoldings(positions, "USD");

  assert.equal(
    formatPnlUnits(holdingUnrealizedPnlUnits(holdings[0], tickers["BTC-USD"])),
    "+$377.12",
  );
  assert.equal(holdingUnrealizedPnlPercent(holdings[0], tickers["BTC-USD"]), "+12.57%");
  assert.equal(
    formatPnlUnits(holdingUnrealizedPnlUnits(holdings[1], tickers["ETH-USD"])),
    "+$965.34",
  );
  assert.equal(holdingUnrealizedPnlPercent(holdings[1], tickers["ETH-USD"]), "+16.09%");
  assert.equal(formatPnlUnits(holdingsUnrealizedPnlUnits(holdings, tickers)), "+$1,342.46");
  assert.equal(holdingsUnrealizedPnlPercent(holdings, tickers), "+14.92%");
});

test("unrealized loss and break-even values retain explicit, neutral-safe signs", () => {
  const [bitcoin] = createPortfolioHoldings(positions, "USD");
  const loss = holdingUnrealizedPnlUnits(bitcoin, { price: "50000" });
  const breakEven = holdingUnrealizedPnlUnits(bitcoin, { price: "60000" });

  assert.equal(formatPnlUnits(loss), "-$500.00");
  assert.equal(holdingUnrealizedPnlPercent(bitcoin, { price: "50000" }), "-16.67%");
  assert.equal(unitsToDecimalString(loss), "-500");
  assert.equal(formatPnlUnits(breakEven), "$0.00");
  assert.equal(holdingUnrealizedPnlPercent(bitcoin, { price: "60000" }), "0.00%");
});

test("aggregates persisted realized profit and loss including closed positions", () => {
  const realizedPnl = positionsRealizedPnlUnits(positions);

  assert.equal(unitsToDecimalString(realizedPnl), "98");
  assert.equal(formatPnlUnits(realizedPnl), "+$98.00");
  assert.equal(formatPnlUnits(positionsRealizedPnlUnits([])), "$0.00");
  assert.equal(
    formatPnlUnits(positionsRealizedPnlUnits([{ ...positions[0], realizedPnl: "-100.005" }])),
    "-$100.01",
  );
  assert.equal(positionsRealizedPnlUnits([{ ...positions[0], realizedPnl: "1e3" }]), null);
});

test("formats API decimals without losing cents or quantity precision", () => {
  assert.equal(formatHoldingQuantity("0.05"), "0.050000");
  assert.equal(formatHoldingQuantity("10000.12345678"), "10,000.12345678");
  assert.equal(formatUsdDecimal("0.4683"), "$0.4683");
  assert.equal(formatUsdDecimal("61450"), "$61,450.00");
  assert.equal(
    formatUsdUnits(cashTotalUnits({ available: "99999999999999999999.99", locked: "0.01" })),
    "$100,000,000,000,000,000,000.00",
  );
});

test("small balances change only when a live market value is below ten dollars", () => {
  const holdings = createPortfolioHoldings(
    [...positions, { asset: "XRP", averageCost: "0.5", quantity: "1", realizedPnl: "0" }],
    "USD",
  );
  assert.equal(smallBalanceAssetKey(holdings, { ...tickers, "XRP-USD": { price: "0.50" } }), "XRP");
});
