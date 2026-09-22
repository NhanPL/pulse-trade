import type { PortfolioSummaryValues } from "./portfolio-summary";

// K02 is the summary presentation step. These fixtures are never account or market data.
export const PORTFOLIO_SUMMARY_PREVIEW = {
  totalValue: "124638.57",
  unrealizedPnl: "3217.46",
  realizedPnl: "2124.83",
  cashBalance: "18642.30",
} satisfies PortfolioSummaryValues;
