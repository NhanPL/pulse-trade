import type { PortfolioSummaryValues } from "../model/portfolio-summary";
import { PortfolioSummaryCard } from "./PortfolioSummaryCard";

export function PortfolioSummary({ values }: { values: PortfolioSummaryValues }) {
  return (
    <section aria-label="Portfolio summary">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PortfolioSummaryCard
          amount={values.totalValue}
          description="The USD value of your cash and crypto holdings, including funds reserved for open orders."
          icon="wallet"
          label="Total Value"
          note="Cash and crypto · USD"
        />
        <PortfolioSummaryCard
          amount={values.unrealizedPnl}
          description="The difference between the current market value and cost basis of the crypto you still hold."
          highlightNote={values.unrealizedPnlPercent !== null}
          icon="trend"
          isPnl
          label="Unrealized P&L"
          note={values.unrealizedPnlPercent ?? "Open positions · USD"}
        />
        <PortfolioSummaryCard
          amount={values.realizedPnl}
          description="Accumulated profit or loss from completed paper sells, measured against weighted-average cost."
          icon="bars"
          isPnl
          label="Realized P&L"
          note="Completed sells · USD"
        />
        <PortfolioSummaryCard
          amount={values.cashBalance}
          description="Your total virtual USD cash, including both available cash and cash reserved for open orders."
          icon="cash"
          label="Cash Balance"
          note="Virtual cash · USD"
        />
      </dl>
    </section>
  );
}
