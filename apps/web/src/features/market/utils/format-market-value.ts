const usdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

const smallUsdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 4,
  minimumFractionDigits: 4,
  style: "currency",
});

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

export function formatMarketPrice(value: string): string {
  const amount = Number(value);
  return amount < 1 ? smallUsdFormatter.format(amount) : usdFormatter.format(amount);
}

export function formatMarketVolume(value: string): string {
  return compactUsdFormatter.format(Number(value));
}

export function formatPercentChange(value: string): string {
  const amount = Number(value);
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(2)}%`;
}
