"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useStore } from "zustand";

import { Badge } from "@/components/ui/Badge";
import { classNames } from "@/components/ui/class-names";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  tickerStore,
  useMarketIsStale,
  useTicker,
  type MarketTicker,
  type TickerStore,
} from "@/features/realtime/stores/ticker-store";
import { formatPercentChange } from "@/lib/format/market-value";

import { filterHoldings, type PortfolioHolding } from "../model/holding";
import {
  allocationPercent,
  formatHoldingQuantity,
  formatPnlUnits,
  formatUsdDecimal,
  formatUsdUnits,
  holdingUnrealizedPnlPercent,
  holdingUnrealizedPnlUnits,
  holdingsMarketValueUnits,
  holdingsUnrealizedPnlPercent,
  holdingsUnrealizedPnlUnits,
  multiplyDecimalUnits,
  smallBalanceAssetKey,
} from "../model/portfolio-valuation";

type HoldingsSectionProps = {
  holdings: readonly PortfolioHolding[];
  isRealtimeDelayed?: boolean;
  isValuationDelayed?: boolean;
};

type ValueTone = "positive" | "negative" | "neutral";

type HoldingLiveValues = {
  change: string;
  marketValue: string;
  pnl: string;
  pnlPercent: string;
  pnlTone: ValueTone;
  price: string;
  priceTone: ValueTone;
};

const assetMarkStyles: Record<string, string> = {
  ADA: "border-blue-400/30 bg-blue-500/80 text-white",
  BTC: "border-orange-300/30 bg-orange-500 text-white",
  ETH: "border-indigo-300/30 bg-indigo-500/80 text-white",
  SOL: "border-purple-300/30 bg-slate-950 text-teal-300",
  XRP: "border-slate-300/30 bg-slate-600 text-white",
};

const assetMarks: Record<string, string> = {
  ADA: "A",
  BTC: "₿",
  ETH: "◆",
  SOL: "≋",
  XRP: "X",
};

function toneClass(tone: ValueTone): string {
  if (tone === "positive") return "text-positive";
  if (tone === "negative") return "text-negative";
  return "text-foreground-secondary";
}

function currentValues(
  holding: PortfolioHolding,
  ticker: MarketTicker | undefined,
): HoldingLiveValues {
  if (!ticker) {
    return {
      change: "—",
      marketValue: "—",
      pnl: "—",
      pnlPercent: "—",
      pnlTone: "neutral",
      price: "—",
      priceTone: "neutral",
    };
  }
  const marketValue = multiplyDecimalUnits(holding.quantity, ticker.price);
  const pnlUnits = holdingUnrealizedPnlUnits(holding, ticker);

  return {
    change: formatPercentChange(ticker.change24hPercent),
    marketValue: formatUsdUnits(marketValue),
    pnl: formatPnlUnits(pnlUnits),
    pnlPercent: holdingUnrealizedPnlPercent(holding, ticker) ?? "—",
    pnlTone:
      pnlUnits === null || pnlUnits === BigInt(0)
        ? "neutral"
        : pnlUnits < BigInt(0)
          ? "negative"
          : "positive",
    price: formatUsdDecimal(ticker.price),
    priceTone: ticker.change24hPercent.startsWith("-") ? "negative" : "positive",
  };
}

function AssetIdentity({ holding }: { holding: PortfolioHolding }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={classNames(
          "grid size-10 shrink-0 place-items-center rounded-full border text-lg font-bold",
          assetMarkStyles[holding.asset] ?? "border-brand/25 bg-brand-subtle text-brand",
        )}
      >
        {assetMarks[holding.asset] ?? holding.asset.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{holding.asset}</span>
        <span className="block truncate text-xs text-foreground-muted">{holding.name}</span>
      </span>
    </div>
  );
}

function HoldingAllocation({
  holding,
  holdings,
}: {
  holding: PortfolioHolding;
  holdings: readonly PortfolioHolding[];
}) {
  const allocationSelector = useMemo(
    () => (state: TickerStore) => allocationPercent(holding, holdings, state.tickers),
    [holding, holdings],
  );
  const allocation = useStore(tickerStore, allocationSelector);

  return (
    <span className="mt-1.5 flex items-center gap-2">
      <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-foreground-secondary">
        {allocation ?? "—"}
      </span>
      <span aria-hidden="true" className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
        {allocation ? (
          <span
            className="block h-full rounded-full bg-linear-to-r from-teal-500 to-teal-300"
            style={{ width: allocation }}
          />
        ) : null}
      </span>
    </span>
  );
}

function Quantity({
  holding,
  holdings,
}: {
  holding: PortfolioHolding;
  holdings: readonly PortfolioHolding[];
}) {
  return (
    <div>
      <span className="block font-mono text-sm tabular-nums text-foreground">
        {formatHoldingQuantity(holding.quantity)}
      </span>
      <HoldingAllocation holding={holding} holdings={holdings} />
    </div>
  );
}

function PriceWithChange({ isDelayed, values }: { isDelayed: boolean; values: HoldingLiveValues }) {
  const unavailable = values.price === "—";
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1">
      <span
        aria-label={unavailable ? "Current price unavailable" : undefined}
        className="font-mono text-sm tabular-nums text-foreground"
      >
        {values.price}
      </span>
      <span className={classNames("font-mono text-xs tabular-nums", toneClass(values.priceTone))}>
        {values.change}
      </span>
      {isDelayed ? <span className="text-xs font-medium text-warning">Delayed</span> : null}
    </span>
  );
}

function PnlWithPercent({ values }: { values: HoldingLiveValues }) {
  const unavailable = values.pnl === "—";

  return (
    <span
      aria-label={unavailable ? "Unrealized profit and loss not available" : undefined}
      className={classNames("block font-mono tabular-nums", toneClass(values.pnlTone))}
    >
      <span className="block text-sm">{values.pnl}</span>
      <span className="mt-1 block text-xs">{values.pnlPercent}</span>
    </span>
  );
}

function TradeLink({ holding }: { holding: PortfolioHolding }) {
  return (
    <Link
      aria-label={`Open ${holding.symbol} trading workspace`}
      className="inline-grid size-9 place-items-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-selected hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      href={`/trade/${holding.symbol}`}
    >
      <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
        <path d="m9 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      </svg>
    </Link>
  );
}

function HoldingsTableRow({
  holding,
  holdings,
  isRealtimeDelayed,
}: {
  holding: PortfolioHolding;
  holdings: readonly PortfolioHolding[];
  isRealtimeDelayed: boolean;
}) {
  const ticker = useTicker(holding.symbol);
  const isMarketStale = useMarketIsStale(holding.symbol);
  const isDelayed = isRealtimeDelayed || isMarketStale;
  const values = currentValues(holding, ticker);

  return (
    <tr className="border-b border-border-subtle transition-colors last:border-b-0 hover:bg-surface-hover/45">
      <th className="px-6 py-3 text-left font-normal" scope="row">
        <AssetIdentity holding={holding} />
      </th>
      <td className="px-3 py-3">
        <Quantity holding={holding} holdings={holdings} />
      </td>
      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-foreground">
        {formatUsdDecimal(holding.averageCost)}
      </td>
      <td className="px-3 py-3 text-right" data-live-price={holding.symbol}>
        <PriceWithChange isDelayed={isDelayed} values={values} />
      </td>
      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-foreground">
        {values.marketValue}
        {isDelayed ? <span className="sr-only"> (delayed)</span> : null}
      </td>
      <td className="px-3 py-3 text-right">
        <PnlWithPercent values={values} />
      </td>
      <td className="px-2 py-3 text-center">
        <TradeLink holding={holding} />
      </td>
    </tr>
  );
}

function HoldingsTable({
  holdings,
  isRealtimeDelayed,
  valuationHoldings,
}: {
  holdings: readonly PortfolioHolding[];
  isRealtimeDelayed: boolean;
  valuationHoldings: readonly PortfolioHolding[];
}) {
  return (
    <table
      aria-label="Holdings table"
      className="hidden w-full table-fixed border-collapse xl:table"
    >
      <colgroup>
        <col className="w-[15%]" />
        <col className="w-[21%]" />
        <col className="w-[14%]" />
        <col className="w-[18%]" />
        <col className="w-[16%]" />
        <col className="w-[13%]" />
        <col className="w-[3%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-border-subtle text-left text-xs font-medium text-foreground-secondary">
          <th className="px-6 py-3.5 font-medium" scope="col">
            Asset
          </th>
          <th className="px-3 py-3.5 font-medium" scope="col">
            Quantity
          </th>
          <th className="px-3 py-3.5 text-right font-medium" scope="col">
            Avg Cost (USD)
          </th>
          <th className="px-3 py-3.5 text-right font-medium" scope="col">
            Current Price (USD)
          </th>
          <th className="px-3 py-3.5 text-right font-medium" scope="col">
            Market Value (USD)
          </th>
          <th className="px-3 py-3.5 text-right font-medium" scope="col">
            Unrealized P&amp;L (USD)
          </th>
          <th aria-label="Actions" className="px-2 py-3.5" scope="col" />
        </tr>
      </thead>
      <tbody>
        {holdings.map((holding) => (
          <HoldingsTableRow
            holding={holding}
            holdings={valuationHoldings}
            isRealtimeDelayed={isRealtimeDelayed}
            key={holding.asset}
          />
        ))}
      </tbody>
    </table>
  );
}

function HoldingCard({
  holding,
  holdings,
  isRealtimeDelayed,
}: {
  holding: PortfolioHolding;
  holdings: readonly PortfolioHolding[];
  isRealtimeDelayed: boolean;
}) {
  const ticker = useTicker(holding.symbol);
  const isMarketStale = useMarketIsStale(holding.symbol);
  const isDelayed = isRealtimeDelayed || isMarketStale;
  const values = currentValues(holding, ticker);

  return (
    <li className="rounded-lg border border-border-subtle bg-surface/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <AssetIdentity holding={holding} />
        <TradeLink holding={holding} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4 text-sm">
        <div className="col-span-2">
          <dt className="mb-1 text-xs text-foreground-muted">Quantity</dt>
          <dd>
            <Quantity holding={holding} holdings={holdings} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Avg Cost (USD)</dt>
          <dd className="mt-1 font-mono tabular-nums text-foreground">
            {formatUsdDecimal(holding.averageCost)}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-xs text-foreground-muted">Market Value (USD)</dt>
          <dd className="mt-1 font-mono tabular-nums text-foreground">
            {values.marketValue}
            {isDelayed ? <span className="sr-only"> (delayed)</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">Current Price (USD)</dt>
          <dd className="mt-1" data-live-price={holding.symbol}>
            <PriceWithChange isDelayed={isDelayed} values={values} />
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-xs text-foreground-muted">Unrealized P&amp;L (USD)</dt>
          <dd className="mt-1">
            <PnlWithPercent values={values} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

function HoldingCards({
  holdings,
  isRealtimeDelayed,
  valuationHoldings,
}: {
  holdings: readonly PortfolioHolding[];
  isRealtimeDelayed: boolean;
  valuationHoldings: readonly PortfolioHolding[];
}) {
  return (
    <ul aria-label="Holdings cards" className="grid gap-3 p-3 md:grid-cols-2 xl:hidden">
      {holdings.map((holding) => (
        <HoldingCard
          holding={holding}
          holdings={valuationHoldings}
          isRealtimeDelayed={isRealtimeDelayed}
          key={holding.asset}
        />
      ))}
    </ul>
  );
}

function PortfolioTotals({
  holdings,
  isDelayed,
}: {
  holdings: readonly PortfolioHolding[];
  isDelayed: boolean;
}) {
  const marketValueSelector = useMemo(
    () => (state: TickerStore) => holdingsMarketValueUnits(holdings, state.tickers),
    [holdings],
  );
  const pnlSelector = useMemo(
    () => (state: TickerStore) => holdingsUnrealizedPnlUnits(holdings, state.tickers),
    [holdings],
  );
  const pnlPercentSelector = useMemo(
    () => (state: TickerStore) => holdingsUnrealizedPnlPercent(holdings, state.tickers),
    [holdings],
  );
  const marketValue = useStore(tickerStore, marketValueSelector);
  const pnl = useStore(tickerStore, pnlSelector);
  const pnlPercent = useStore(tickerStore, pnlPercentSelector);
  const pnlText = formatPnlUnits(pnl);
  const pnlTone =
    pnl === null || pnl === BigInt(0) ? "neutral" : pnl < BigInt(0) ? "negative" : "positive";

  return (
    <footer className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-foreground-secondary">
        Total Assets
        <span className="ml-4 font-mono tabular-nums text-foreground">{holdings.length}</span>
      </p>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 sm:justify-end">
        <span className="text-foreground-secondary">Total Market Value</span>
        {isDelayed ? <Badge variant="warning">Delayed</Badge> : null}
        <span className="font-mono text-base tabular-nums text-foreground">
          {formatUsdUnits(marketValue)}
        </span>
        <span className={classNames("font-mono tabular-nums", toneClass(pnlTone))}>{pnlText}</span>
        <span className={classNames("font-mono tabular-nums", toneClass(pnlTone))}>
          {pnlPercent ?? "—"}
        </span>
      </div>
    </footer>
  );
}

export function HoldingsSection({
  holdings,
  isRealtimeDelayed = false,
  isValuationDelayed = false,
}: HoldingsSectionProps) {
  const searchId = useId();
  const [searchTerm, setSearchTerm] = useState("");
  const [hideSmallBalances, setHideSmallBalances] = useState(true);
  const smallBalanceSelector = useMemo(
    () => (state: TickerStore) => smallBalanceAssetKey(holdings, state.tickers),
    [holdings],
  );
  const smallBalanceKey = useStore(tickerStore, smallBalanceSelector);
  const smallBalanceAssets = useMemo(
    () => new Set(smallBalanceKey ? smallBalanceKey.split("|") : []),
    [smallBalanceKey],
  );
  const visibleHoldings = useMemo(
    () => filterHoldings(holdings, searchTerm, hideSmallBalances, smallBalanceAssets),
    [hideSmallBalances, holdings, searchTerm, smallBalanceAssets],
  );
  const noPositions = holdings.length === 0;

  return (
    <section
      aria-labelledby="holdings-heading"
      className="overflow-hidden rounded-lg border border-border bg-surface-elevated/80 shadow-panel"
    >
      <div className="flex flex-col gap-4 border-b border-border-subtle px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <h2
          className="flex items-center gap-3 text-base font-semibold text-foreground"
          id="holdings-heading"
        >
          <svg
            aria-hidden="true"
            className="size-6 text-foreground-secondary"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 7.5h16v11H4zM8 7.5V5h8v2.5M4 11h16"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          Holdings
        </h2>

        {!noPositions ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              aria-checked={hideSmallBalances}
              className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-1 text-sm text-foreground-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:justify-start"
              onClick={() => setHideSmallBalances((current) => !current)}
              role="switch"
              type="button"
            >
              <span>Hide Small Balances</span>
              <span
                aria-hidden="true"
                className={classNames(
                  "relative h-5 w-9 rounded-full border transition-colors",
                  hideSmallBalances
                    ? "border-brand/60 bg-brand"
                    : "border-border-strong bg-surface-interactive",
                )}
              >
                <span
                  className={classNames(
                    "absolute left-0 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform",
                    hideSmallBalances ? "translate-x-[17px]" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>

            <div className="relative sm:w-72">
              <label className="sr-only" htmlFor={searchId}>
                Search holdings
              </label>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-foreground-muted"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="m16 16 4 4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
              </svg>
              <input
                className="h-10 w-full rounded-lg border border-border bg-surface-interactive pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted hover:border-border-strong focus:border-brand focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={noPositions}
                id={searchId}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search assets..."
                type="search"
                value={searchTerm}
              />
            </div>
          </div>
        ) : null}
      </div>

      {visibleHoldings.length > 0 ? (
        <>
          <HoldingsTable
            holdings={visibleHoldings}
            isRealtimeDelayed={isRealtimeDelayed}
            valuationHoldings={holdings}
          />
          <HoldingCards
            holdings={visibleHoldings}
            isRealtimeDelayed={isRealtimeDelayed}
            valuationHoldings={holdings}
          />
        </>
      ) : noPositions ? (
        <div className="p-4 sm:p-6">
          <EmptyState
            action={
              <Link
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-foreground-inverse shadow-brand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                href="/"
              >
                Explore Markets
              </Link>
            }
            description="Start paper trading to build your portfolio."
            size="compact"
            title="No crypto positions yet"
          />
        </div>
      ) : (
        <div className="px-6 py-12 text-center" role="status">
          <p className="font-medium text-foreground">No matching holdings</p>
          <p className="mt-1 text-sm text-foreground-muted">Try another asset name or symbol.</p>
        </div>
      )}

      {!noPositions ? <PortfolioTotals holdings={holdings} isDelayed={isValuationDelayed} /> : null}
    </section>
  );
}
