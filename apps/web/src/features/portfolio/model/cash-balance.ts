import type { PortfolioResponse } from "@pulse-trade/contracts";

export type CashBalance = PortfolioResponse["data"]["cash"];

export type CashBalancePresentation = {
  available: string;
  locked: string;
  total: string;
  availablePercent: number;
  lockedPercent: number;
  hasCash: boolean;
};

const scale = BigInt("1000000000000000000");
const unitsPerCent = scale / BigInt(100);
const percentScale = BigInt(10000);
const wholeNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function parseBalance(value: string): bigint | null {
  // Match the nonnegative NUMERIC(38,18) wallet values without converting money to floats.
  if (!/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * scale + BigInt(fraction.padEnd(18, "0"));
}

function formatUsd(units: bigint): string {
  const cents = (units + unitsPerCent / BigInt(2)) / unitsPerCent;
  return `$${wholeNumberFormatter.format(cents / BigInt(100))}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export function presentCashBalance(cash: CashBalance | null): CashBalancePresentation | null {
  if (cash === null) return null;
  const available = parseBalance(cash.available);
  const locked = parseBalance(cash.locked);
  if (available === null || locked === null) return null;

  const total = available + locked;
  const hasCash = total > BigInt(0);
  const availableBasisPoints = hasCash
    ? (available * percentScale + total / BigInt(2)) / total
    : BigInt(0);
  // Complement the rounded share so displayed allocations always sum to 100% for nonzero cash.
  const lockedBasisPoints = hasCash ? percentScale - availableBasisPoints : BigInt(0);

  return {
    available: formatUsd(available),
    locked: formatUsd(locked),
    total: formatUsd(total),
    availablePercent: Number(availableBasisPoints) / 100,
    lockedPercent: Number(lockedBasisPoints) / 100,
    hasCash,
  };
}
