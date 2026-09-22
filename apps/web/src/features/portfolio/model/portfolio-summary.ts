export type PortfolioSummaryValues = {
  totalValue: string | null;
  unrealizedPnl: string | null;
  realizedPnl: string | null;
  cashBalance: string | null;
};

export type SummaryTone = "neutral" | "positive" | "negative";

const amountFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pnlFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function presentSummaryValue(
  value: string | null,
  isPnl: boolean,
): { text: string; tone: SummaryTone } {
  if (value === null || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return { text: "—", tone: "neutral" };
  }

  // Formatting is display-only; this component never calculates balances or valuation.
  const amount = Number(value);
  if (!Number.isFinite(amount)) return { text: "—", tone: "neutral" };
  const text = (isPnl ? pnlFormatter : amountFormatter).format(amount);
  const tone = !isPnl
    ? "neutral"
    : text.startsWith("+")
      ? "positive"
      : text.startsWith("-")
        ? "negative"
        : "neutral";

  return { text, tone };
}
