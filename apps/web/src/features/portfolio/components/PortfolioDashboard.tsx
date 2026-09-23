"use client";

import { useMemo } from "react";
import type { PortfolioResponse } from "@pulse-trade/contracts";
import { useStore } from "zustand";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRealtimeConnectionState } from "@/features/realtime/stores/connection-state-store";
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
import { PortfolioSummary, type PortfolioValuationStatus } from "./PortfolioSummary";

type ValuationState = Readonly<{
  affectedAssets: readonly string[];
  isConnectionDelayed: boolean;
  status: PortfolioValuationStatus;
}>;

function PortfolioPending() {
  return (
    <div aria-label="Portfolio loading" aria-live="polite" className="space-y-6" role="status">
      <p className="sr-only">Loading your portfolio</p>
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-28" variant="text" />
        <Skeleton className="h-4 max-w-md" variant="text" />
      </div>
      <section aria-label="Loading portfolio summary">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton className="min-h-36" key={card} />
          ))}
        </div>
      </section>
      <section
        aria-label="Loading cash balances"
        className="rounded-lg border border-border bg-surface-elevated/80 p-5 shadow-panel sm:p-6"
      >
        <Skeleton className="h-5 w-36" variant="text" />
        <Skeleton className="mt-5 min-h-28" />
      </section>
      <section
        aria-label="Loading holdings"
        className="rounded-lg border border-border bg-surface-elevated/80 p-5 shadow-panel sm:p-6"
      >
        <Skeleton className="h-5 w-28" variant="text" />
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          {[0, 1].map((row) => (
            <Skeleton className="min-h-24" key={row} />
          ))}
        </div>
      </section>
    </div>
  );
}

function marketStateKey(holdings: readonly PortfolioHolding[], state: TickerStore): string {
  const missing: string[] = [];
  const stale: string[] = [];

  for (const holding of holdings) {
    if (!state.tickers[holding.symbol]) missing.push(holding.asset);
    if (state.marketFreshness[holding.symbol]?.status === "STALE") stale.push(holding.asset);
  }

  return `${missing.join("|")}::${stale.join("|")}`;
}

function usePortfolioValuationState(holdings: readonly PortfolioHolding[]): ValuationState {
  const connectionState = useRealtimeConnectionState();
  const stateKeySelector = useMemo(
    () => (state: TickerStore) => marketStateKey(holdings, state),
    [holdings],
  );
  const stateKey = useStore(tickerStore, stateKeySelector);
  const [missingKey = "", staleKey = ""] = stateKey.split("::");
  const missingAssets = missingKey ? missingKey.split("|") : [];
  const staleAssets = staleKey ? staleKey.split("|") : [];
  const isConnectionDelayed =
    connectionState === "DISCONNECTED" || connectionState === "RECONNECTING";

  if (holdings.length === 0) {
    return { affectedAssets: [], isConnectionDelayed: false, status: "live" };
  }

  if (isConnectionDelayed || staleAssets.length > 0) {
    return {
      affectedAssets: isConnectionDelayed ? holdings.map((holding) => holding.asset) : staleAssets,
      isConnectionDelayed,
      status: "delayed",
    };
  }

  if (missingAssets.length > 0) {
    return {
      affectedAssets: missingAssets,
      isConnectionDelayed: false,
      status: "waiting",
    };
  }

  return { affectedAssets: [], isConnectionDelayed: false, status: "live" };
}

function PortfolioValuationNotice({ state }: { state: ValuationState }) {
  if (state.status === "live") return null;
  const assets = state.affectedAssets.join(", ");
  const isDelayed = state.status === "delayed";

  return (
    <section
      aria-label="Portfolio valuation status"
      aria-live="polite"
      className={
        isDelayed
          ? "flex flex-col gap-3 rounded-lg border border-warning/35 bg-warning-subtle/30 px-4 py-3 sm:flex-row sm:items-center"
          : "flex flex-col gap-3 rounded-lg border border-info/35 bg-info-subtle/30 px-4 py-3 sm:flex-row sm:items-center"
      }
      role="status"
    >
      <Badge className="w-fit shrink-0" showDot variant={isDelayed ? "warning" : "info"}>
        {isDelayed ? "Delayed" : "Waiting"}
      </Badge>
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {isDelayed ? "Valuation delayed" : "Waiting for live prices"}
        </h2>
        <p className="mt-0.5 text-sm leading-5 text-foreground-secondary">
          {isDelayed
            ? `${assets || "Portfolio"} market data is delayed. Last known values remain visible where available and are marked in totals.`
            : `${assets} prices have not arrived yet. Affected totals remain unavailable until live data is received.`}
        </p>
      </div>
    </section>
  );
}

function LivePortfolioSummary({
  cash,
  holdings,
  positions,
  valuationStatus,
}: {
  cash: PortfolioResponse["data"]["cash"];
  holdings: readonly PortfolioHolding[];
  positions: PortfolioResponse["data"]["positions"];
  valuationStatus: PortfolioValuationStatus;
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

  return <PortfolioSummary valuationStatus={valuationStatus} values={values} />;
}

function PortfolioValuation({
  cash,
  holdings,
  positions,
}: {
  cash: PortfolioResponse["data"]["cash"];
  holdings: readonly PortfolioHolding[];
  positions: PortfolioResponse["data"]["positions"];
}) {
  const valuationState = usePortfolioValuationState(holdings);

  return (
    <>
      <PortfolioValuationNotice state={valuationState} />
      <LivePortfolioSummary
        cash={cash}
        holdings={holdings}
        positions={positions}
        valuationStatus={valuationState.status}
      />
      <BalancePanel cash={cash} />
      <HoldingsSection
        holdings={holdings}
        isRealtimeDelayed={valuationState.isConnectionDelayed}
        isValuationDelayed={valuationState.status === "delayed"}
      />
    </>
  );
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
      <PortfolioValuation
        cash={portfolio.data.cash}
        holdings={holdings}
        positions={portfolio.data.positions}
      />
    </>
  );
}
