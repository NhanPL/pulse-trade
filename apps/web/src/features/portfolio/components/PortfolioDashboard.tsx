"use client";

import { useMemo } from "react";
import type { PortfolioResponse } from "@pulse-trade/contracts";
import { useStore } from "zustand";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { tickerStore, type TickerStore } from "@/features/realtime/stores/ticker-store";

import { usePortfolio } from "../hooks/usePortfolio";
import { usePortfolioRealtime } from "../hooks/usePortfolioRealtime";
import {
  createPortfolioHoldings,
  portfolioTickerSymbols,
  type PortfolioHolding,
} from "../model/holding";
import {
  cashTotalUnits,
  holdingsUnrealizedPnlPercent,
  holdingsUnrealizedPnlUnits,
  positionsRealizedPnlUnits,
  totalPortfolioValueUnits,
  unitsToDecimalString,
} from "../model/portfolio-valuation";
import { BalancePanel } from "./BalancePanel";
import { HoldingsSection } from "./HoldingsSection";
import { PortfolioSummary } from "./PortfolioSummary";

function PortfolioPending() {
  return (
    <section
      aria-label="Portfolio data"
      className="rounded-lg border border-border bg-surface-elevated/80 px-6 py-12 text-center shadow-panel"
      role="status"
    >
      <span
        aria-hidden="true"
        className="mx-auto block size-7 animate-spin rounded-full border-2 border-brand border-r-transparent motion-reduce:animate-none"
      />
      <p className="mt-4 font-medium text-foreground">Loading your portfolio</p>
    </section>
  );
}

function LivePortfolioSummary({
  cash,
  holdings,
  positions,
}: {
  cash: PortfolioResponse["data"]["cash"];
  holdings: readonly PortfolioHolding[];
  positions: PortfolioResponse["data"]["positions"];
}) {
  const totalValueSelector = useMemo(
    () => (state: TickerStore) => totalPortfolioValueUnits(cash, holdings, state.tickers),
    [cash, holdings],
  );
  const unrealizedPnlSelector = useMemo(
    () => (state: TickerStore) => holdingsUnrealizedPnlUnits(holdings, state.tickers),
    [holdings],
  );
  const unrealizedPnlPercentSelector = useMemo(
    () => (state: TickerStore) => holdingsUnrealizedPnlPercent(holdings, state.tickers),
    [holdings],
  );
  const totalValue = useStore(tickerStore, totalValueSelector);
  const unrealizedPnl = useStore(tickerStore, unrealizedPnlSelector);
  const unrealizedPnlPercent = useStore(tickerStore, unrealizedPnlPercentSelector);
  const cashBalance = cashTotalUnits(cash);
  const realizedPnl = positionsRealizedPnlUnits(positions);
  const values = useMemo(
    () => ({
      totalValue: unitsToDecimalString(totalValue),
      unrealizedPnl: unitsToDecimalString(unrealizedPnl),
      unrealizedPnlPercent,
      realizedPnl: unitsToDecimalString(realizedPnl),
      cashBalance: unitsToDecimalString(cashBalance),
    }),
    [cashBalance, realizedPnl, totalValue, unrealizedPnl, unrealizedPnlPercent],
  );

  return <PortfolioSummary values={values} />;
}

export function PortfolioDashboard() {
  const portfolio = usePortfolio();
  const holdings = useMemo(
    () =>
      portfolio.data
        ? createPortfolioHoldings(portfolio.data.positions, portfolio.data.quoteCurrency)
        : [],
    [portfolio.data],
  );
  const symbols = useMemo(() => portfolioTickerSymbols(holdings), [holdings]);
  usePortfolioRealtime(symbols);

  if (portfolio.isPending) return <PortfolioPending />;
  if (portfolio.isError || !portfolio.data) {
    return (
      <section
        aria-label="Portfolio data"
        className="rounded-lg border border-negative/30 bg-negative-subtle/35 px-6 py-10 text-center shadow-panel"
        role="alert"
      >
        <h2 className="text-lg font-semibold text-foreground">Portfolio unavailable</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-foreground-secondary">
          We couldn&apos;t load your paper portfolio. Your balances have not been changed.
        </p>
        <Button className="mt-5" onClick={() => void portfolio.refetch()}>
          Try again
        </Button>
      </section>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge variant="brand">Paper account</Badge>
        <p className="text-sm text-foreground-muted">
          Balances and positions come from your account. Market prices update live.
        </p>
      </div>
      <LivePortfolioSummary
        cash={portfolio.data.cash}
        holdings={holdings}
        positions={portfolio.data.positions}
      />
      <BalancePanel cash={portfolio.data.cash} />
      <HoldingsSection holdings={holdings} />
    </>
  );
}
