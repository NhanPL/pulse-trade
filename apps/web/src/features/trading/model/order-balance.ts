import type { PortfolioResponse } from "@pulse-trade/contracts";

type Portfolio = PortfolioResponse["data"];
export type OrderBalance = Portfolio["balances"][number];

const DECIMAL_PLACES = 18;
const DECIMAL_SCALE = BigInt(10) ** BigInt(DECIMAL_PLACES);
const wholeNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function findOrderBalance(portfolio: Portfolio, asset: string): OrderBalance {
  return (
    portfolio.balances.find((balance) => balance.asset === asset) ?? {
      asset,
      available: "0",
      locked: "0",
    }
  );
}

export function formatOrderBalance(value: string, asset: string, quoteAsset: string): string {
  const units = decimalUnits(value);
  if (units === null) return `— ${asset}`;
  if (asset === quoteAsset) return formatUsd(units);

  const displayScale = BigInt(100_000_000);
  const rounded = (units * displayScale + DECIMAL_SCALE / BigInt(2)) / DECIMAL_SCALE;
  if (units > BigInt(0) && rounded === BigInt(0)) return `<0.00000001 ${asset}`;

  const whole = rounded / displayScale;
  const fraction = String(rounded % displayScale)
    .padStart(8, "0")
    .replace(/0+$/, "");
  const amount = `${wholeNumberFormatter.format(whole)}${fraction ? `.${fraction}` : ""}`;
  return `${amount} ${asset}`;
}

function decimalUnits(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * DECIMAL_SCALE + BigInt(fraction.padEnd(DECIMAL_PLACES, "0"));
}

function formatUsd(units: bigint): string {
  const cents = (units * BigInt(100) + DECIMAL_SCALE / BigInt(2)) / DECIMAL_SCALE;
  return `$${wholeNumberFormatter.format(cents / BigInt(100))}.${String(
    cents % BigInt(100),
  ).padStart(2, "0")}`;
}
