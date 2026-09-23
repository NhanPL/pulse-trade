import type { PortfolioResponse } from "@pulse-trade/contracts";

import type { MarketTicker } from "../../realtime/stores/ticker-store";
import type { PortfolioHolding } from "./holding";

const DECIMAL_PLACES = 18;
const DECIMAL_SCALE = BigInt(10) ** BigInt(DECIMAL_PLACES);
const SMALL_BALANCE_LIMIT = BigInt(10) * DECIMAL_SCALE;
const wholeNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type CashBalance = PortfolioResponse["data"]["cash"];
type PortfolioPosition = PortfolioResponse["data"]["positions"][number];
type TickerMap = Readonly<Record<string, MarketTicker>>;

function absoluteUnits(units: bigint): bigint {
  return units < BigInt(0) ? -units : units;
}

function multiplyScaledUnits(left: bigint, right: bigint): bigint {
  const product = left * right;
  const rounded = (absoluteUnits(product) + DECIMAL_SCALE / BigInt(2)) / DECIMAL_SCALE;
  return product < BigInt(0) ? -rounded : rounded;
}

function formatMoneyUnits(units: bigint, showPositiveSign: boolean): string {
  const cents =
    (absoluteUnits(units) + DECIMAL_SCALE / BigInt(200)) / (DECIMAL_SCALE / BigInt(100));
  const sign = cents === BigInt(0) ? "" : units < BigInt(0) ? "-" : showPositiveSign ? "+" : "";

  return `${sign}$${wholeNumberFormatter.format(cents / BigInt(100))}.${String(
    cents % BigInt(100),
  ).padStart(2, "0")}`;
}

function formatPnlPercent(pnl: bigint | null, costBasis: bigint | null): string | null {
  if (pnl === null || costBasis === null || costBasis <= BigInt(0)) return null;
  const absoluteBasisPoints =
    (absoluteUnits(pnl) * BigInt(10_000) + costBasis / BigInt(2)) / costBasis;
  const sign = absoluteBasisPoints === BigInt(0) ? "" : pnl < BigInt(0) ? "-" : "+";

  return `${sign}${absoluteBasisPoints / BigInt(100)}.${String(
    absoluteBasisPoints % BigInt(100),
  ).padStart(2, "0")}%`;
}

export function decimalUnits(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * DECIMAL_SCALE + BigInt(fraction.padEnd(DECIMAL_PLACES, "0"));
}

function signedDecimalUnits(value: string): bigint | null {
  const isNegative = value.startsWith("-");
  const units = decimalUnits(isNegative ? value.slice(1) : value);
  if (units === null) return null;
  return isNegative ? -units : units;
}

export function multiplyDecimalUnits(left: string, right: string): bigint | null {
  const leftUnits = decimalUnits(left);
  const rightUnits = decimalUnits(right);
  if (leftUnits === null || rightUnits === null) return null;

  return multiplyScaledUnits(leftUnits, rightUnits);
}

export function cashTotalUnits(cash: CashBalance): bigint | null {
  const available = decimalUnits(cash.available);
  const locked = decimalUnits(cash.locked);
  return available === null || locked === null ? null : available + locked;
}

export function positionsRealizedPnlUnits(positions: readonly PortfolioPosition[]): bigint | null {
  let total = BigInt(0);

  for (const position of positions) {
    const realizedPnl = signedDecimalUnits(position.realizedPnl);
    if (realizedPnl === null) return null;
    total += realizedPnl;
  }

  return total;
}

export function holdingsMarketValueUnits(
  holdings: readonly PortfolioHolding[],
  tickers: TickerMap,
): bigint | null {
  let total = BigInt(0);

  for (const holding of holdings) {
    const ticker = tickers[holding.symbol];
    if (!ticker) return null;
    const value = multiplyDecimalUnits(holding.quantity, ticker.price);
    if (value === null) return null;
    total += value;
  }

  return total;
}

export function totalPortfolioValueUnits(
  cash: CashBalance,
  holdings: readonly PortfolioHolding[],
  tickers: TickerMap,
): bigint | null {
  const cashValue = cashTotalUnits(cash);
  const holdingsValue = holdingsMarketValueUnits(holdings, tickers);
  return cashValue === null || holdingsValue === null ? null : cashValue + holdingsValue;
}

function holdingCostBasisUnits(holding: PortfolioHolding): bigint | null {
  return multiplyDecimalUnits(holding.quantity, holding.averageCost);
}

export function holdingUnrealizedPnlUnits(
  holding: PortfolioHolding,
  ticker: MarketTicker | undefined,
): bigint | null {
  if (!ticker) return null;
  const quantity = decimalUnits(holding.quantity);
  const averageCost = decimalUnits(holding.averageCost);
  const currentPrice = decimalUnits(ticker.price);
  if (quantity === null || averageCost === null || currentPrice === null) return null;

  return multiplyScaledUnits(currentPrice - averageCost, quantity);
}

export function holdingUnrealizedPnlPercent(
  holding: PortfolioHolding,
  ticker: MarketTicker | undefined,
): string | null {
  return formatPnlPercent(
    holdingUnrealizedPnlUnits(holding, ticker),
    holdingCostBasisUnits(holding),
  );
}

export function holdingsUnrealizedPnlUnits(
  holdings: readonly PortfolioHolding[],
  tickers: TickerMap,
): bigint | null {
  let total = BigInt(0);

  for (const holding of holdings) {
    const pnl = holdingUnrealizedPnlUnits(holding, tickers[holding.symbol]);
    if (pnl === null) return null;
    total += pnl;
  }

  return total;
}

export function holdingsUnrealizedPnlPercent(
  holdings: readonly PortfolioHolding[],
  tickers: TickerMap,
): string | null {
  let costBasis = BigInt(0);

  for (const holding of holdings) {
    const holdingCostBasis = holdingCostBasisUnits(holding);
    if (holdingCostBasis === null) return null;
    costBasis += holdingCostBasis;
  }

  return formatPnlPercent(holdingsUnrealizedPnlUnits(holdings, tickers), costBasis);
}

export function allocationPercent(
  holding: PortfolioHolding,
  holdings: readonly PortfolioHolding[],
  tickers: TickerMap,
): string | null {
  const total = holdingsMarketValueUnits(holdings, tickers);
  const ticker = tickers[holding.symbol];
  if (total === null || total === BigInt(0) || !ticker) return null;
  const value = multiplyDecimalUnits(holding.quantity, ticker.price);
  if (value === null) return null;
  const basisPoints = (value * BigInt(10_000) + total / BigInt(2)) / total;

  return `${basisPoints / BigInt(100)}.${String(basisPoints % BigInt(100)).padStart(2, "0")}%`;
}

export function smallBalanceAssetKey(
  holdings: readonly PortfolioHolding[],
  tickers: TickerMap,
): string {
  return holdings
    .filter((holding) => {
      const ticker = tickers[holding.symbol];
      if (!ticker) return false;
      const value = multiplyDecimalUnits(holding.quantity, ticker.price);
      return value !== null && value < SMALL_BALANCE_LIMIT;
    })
    .map((holding) => holding.asset)
    .sort()
    .join("|");
}

export function formatUsdUnits(units: bigint | null): string {
  return units === null ? "—" : formatMoneyUnits(units, false);
}

export function formatPnlUnits(units: bigint | null): string {
  return units === null ? "—" : formatMoneyUnits(units, true);
}

export function formatUsdDecimal(value: string): string {
  const units = decimalUnits(value);
  if (units === null) return "—";
  const fractionDigits = units < DECIMAL_SCALE ? 4 : 2;
  const displayScale = BigInt(10) ** BigInt(fractionDigits);
  const rounded = (units * displayScale + DECIMAL_SCALE / BigInt(2)) / DECIMAL_SCALE;
  const whole = rounded / displayScale;
  const fraction = String(rounded % displayScale).padStart(fractionDigits, "0");
  return `$${wholeNumberFormatter.format(whole)}.${fraction}`;
}

export function formatHoldingQuantity(value: string): string {
  const parsed = decimalUnits(value);
  if (parsed === null) return "—";
  const [whole, originalFraction = ""] = value.split(".");
  const fraction = originalFraction.padEnd(6, "0").slice(0, 8).replace(/0+$/, "").padEnd(6, "0");
  return `${wholeNumberFormatter.format(BigInt(whole!))}.${fraction}`;
}

export function unitsToDecimalString(units: bigint | null): string | null {
  if (units === null) return null;
  const unsignedUnits = absoluteUnits(units);
  const whole = unsignedUnits / DECIMAL_SCALE;
  const fraction = String(unsignedUnits % DECIMAL_SCALE)
    .padStart(DECIMAL_PLACES, "0")
    .replace(/0+$/, "");
  const sign = units < BigInt(0) ? "-" : "";
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}
