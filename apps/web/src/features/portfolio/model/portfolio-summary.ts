export type PortfolioSummaryValues = {
  totalValue: string | null;
  unrealizedPnl: string | null;
  realizedPnl: string | null;
  cashBalance: string | null;
};

export type SummaryTone = "neutral" | "positive" | "negative";

const scale = BigInt("1000000000000000000");
const unitsPerCent = scale / BigInt(100);
const wholeNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function presentSummaryValue(
  value: string | null,
  isPnl: boolean,
): { text: string; tone: SummaryTone } {
  if (value === null || !/^-?(?:0|[1-9]\d{0,79})(?:\.\d{1,18})?$/.test(value)) {
    return { text: "—", tone: "neutral" };
  }

  const isNegative = value.startsWith("-");
  const unsignedValue = isNegative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsignedValue.split(".");
  const units = BigInt(whole!) * scale + BigInt(fraction.padEnd(18, "0"));
  const cents = (units + unitsPerCent / BigInt(2)) / unitsPerCent;
  const isZero = cents === BigInt(0);
  const sign = !isPnl || isZero ? "" : isNegative ? "-" : "+";
  const text = `${sign}$${wholeNumberFormatter.format(cents / BigInt(100))}.${String(
    cents % BigInt(100),
  ).padStart(2, "0")}`;
  const tone = !isPnl || isZero ? "neutral" : isNegative ? "negative" : "positive";

  return { text, tone };
}
