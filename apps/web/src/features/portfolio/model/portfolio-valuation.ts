import type { PortfolioResponse } from "@pulse-trade/contracts";

import type { MarketTicker } from "../../realtime/stores/ticker-store";
import type { PortfolioHolding } from "./holding";

const DECIMAL_PLACES = 18;
const DECIMAL_SCALE = BigInt(10) ** BigInt(DECIMAL_PLACES);
const SMALL_BALANCE_LIMIT = BigInt(10) * DECIMAL_SCALE;
const wholeNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type CashBalance = PortfolioResponse["data"]["cash"];
type TickerMap = Readonly<Record<string, MarketTicker>>;

export function decimalUnits(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * DECIMAL_SCALE + BigInt(fraction.padEnd(DECIMAL_PLACES, "0"));
}

export function multiplyDecimalUnits(left: string, right: string): bigint | null {
  const leftUnits = decimalUnits(left);
  const rightUnits = decimalUnits(right);
  if (leftUnits === null || rightUnits === null) return null;

  return (leftUnits * rightUnits + DECIMAL_SCALE / BigInt(2)) / DECIMAL_SCALE;
}

export function cashTotalUnits(cash: CashBalance): bigint | null {
  const available = decimalUnits(cash.available);
  const locked = decimalUnits(cash.locked);
  return available === null || locked === null ? null : available + locked;
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
  if (units === null) return "—";
  const cents = (units + DECIMAL_SCALE / BigInt(200)) / (DECIMAL_SCALE / BigInt(100));
  return `$${wholeNumberFormatter.format(cents / BigInt(100))}.${String(cents % BigInt(100)).padStart(2, "0")}`;
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
  const whole = units / DECIMAL_SCALE;
  const fraction = String(units % DECIMAL_SCALE)
    .padStart(DECIMAL_PLACES, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
