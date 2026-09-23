"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { classNames } from "@/components/ui/class-names";

import {
  filterHoldingPreviews,
  type HoldingPreview,
  type HoldingPreviewTotals,
  type HoldingTone,
} from "../model/holding-preview";

type HoldingsSectionProps = {
  holdings: readonly HoldingPreview[];
  totals: HoldingPreviewTotals;
};

const assetMarkStyles: Record<string, string> = {
  ADA: "border-blue-400/30 bg-blue-500/80 text-white",
  BTC: "border-orange-300/30 bg-orange-500 text-white",
  ETH: "border-indigo-300/30 bg-indigo-500/80 text-white",
  SOL: "border-purple-300/30 bg-slate-950 text-teal-300",
};

const assetMarks: Record<string, string> = {
  ADA: "A",
  BTC: "₿",
  ETH: "◆",
  SOL: "≋",
};

function toneClass(tone: HoldingTone): string {
  if (tone === "positive") return "text-positive";
  if (tone === "negative") return "text-negative";
  return "text-foreground-secondary";
}

function AssetIdentity({ holding }: { holding: HoldingPreview }) {
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

function Quantity({ holding }: { holding: HoldingPreview }) {
  return (
    <div>
      <span className="block font-mono text-sm tabular-nums text-foreground">
        {holding.quantity}
      </span>
      <span className="mt-1.5 flex items-center gap-2">
        <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-foreground-secondary">
          {holding.allocation}
        </span>
        <span aria-hidden="true" className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
          <span
            className="block h-full rounded-full bg-linear-to-r from-teal-500 to-teal-300"
            style={{ width: holding.allocation }}
          />
        </span>
      </span>
    </div>
  );
}

function PriceWithChange({ holding }: { holding: HoldingPreview }) {
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1">
      <span className="font-mono text-sm tabular-nums text-foreground">{holding.currentPrice}</span>
      <span className={classNames("font-mono text-xs tabular-nums", toneClass(holding.changeTone))}>
        {holding.change}
      </span>
    </span>
  );
}

function Pnl({ holding }: { holding: HoldingPreview }) {
  return (
    <span className={classNames("block font-mono tabular-nums", toneClass(holding.pnlTone))}>
      <span className="block text-sm">{holding.unrealizedPnl}</span>
      <span className="mt-1 block text-xs">{holding.unrealizedPnlPercent}</span>
    </span>
  );
}

function TradeLink({ asset }: { asset: string }) {
  return (
    <Link
      aria-label={`Open ${asset}-USD trading workspace`}
      className="inline-grid size-9 place-items-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-selected hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      href={`/trade/${asset}-USD`}
    >
      <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
        <path d="m9 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      </svg>
    </Link>
  );
}

function HoldingsTable({ holdings }: { holdings: readonly HoldingPreview[] }) {
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
          <tr
            className="border-b border-border-subtle transition-colors last:border-b-0 hover:bg-surface-hover/45"
            key={holding.asset}
          >
            <th className="px-6 py-3 text-left font-normal" scope="row">
              <AssetIdentity holding={holding} />
            </th>
            <td className="px-3 py-3">
              <Quantity holding={holding} />
            </td>
            <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-foreground">
              {holding.averageCost}
            </td>
            <td className="px-3 py-3 text-right">
              <PriceWithChange holding={holding} />
            </td>
            <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-foreground">
              {holding.marketValue}
            </td>
            <td className="px-3 py-3 text-right">
              <Pnl holding={holding} />
            </td>
            <td className="px-2 py-3 text-center">
              <TradeLink asset={holding.asset} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HoldingCards({ holdings }: { holdings: readonly HoldingPreview[] }) {
  return (
    <ul aria-label="Holdings cards" className="grid gap-3 p-3 md:grid-cols-2 xl:hidden">
      {holdings.map((holding) => (
        <li
          className="rounded-lg border border-border-subtle bg-surface/35 p-4"
          key={holding.asset}
        >
          <div className="flex items-start justify-between gap-3">
            <AssetIdentity holding={holding} />
            <TradeLink asset={holding.asset} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4 text-sm">
            <div className="col-span-2">
              <dt className="mb-1 text-xs text-foreground-muted">Quantity</dt>
              <dd>
                <Quantity holding={holding} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Avg Cost (USD)</dt>
              <dd className="mt-1 font-mono tabular-nums text-foreground">{holding.averageCost}</dd>
            </div>
            <div className="text-right">
              <dt className="text-xs text-foreground-muted">Market Value (USD)</dt>
              <dd className="mt-1 font-mono tabular-nums text-foreground">{holding.marketValue}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Current Price (USD)</dt>
              <dd className="mt-1">
                <PriceWithChange holding={holding} />
              </dd>
            </div>
            <div className="text-right">
              <dt className="text-xs text-foreground-muted">Unrealized P&amp;L (USD)</dt>
              <dd className="mt-1">
                <Pnl holding={holding} />
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function PortfolioTotals({ totals }: { totals: HoldingPreviewTotals }) {
  return (
    <footer className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-foreground-secondary">
        Total Assets{" "}
        <span className="ml-4 font-mono tabular-nums text-foreground">{totals.assetCount}</span>
      </p>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 sm:justify-end">
        <span className="text-foreground-secondary">Total Market Value</span>
        <span className="font-mono text-base tabular-nums text-foreground">
          {totals.marketValue}
        </span>
        <span className={classNames("font-mono tabular-nums", toneClass(totals.pnlTone))}>
          {totals.unrealizedPnl}
        </span>
        <span className={classNames("font-mono tabular-nums", toneClass(totals.pnlTone))}>
          {totals.unrealizedPnlPercent}
        </span>
      </div>
    </footer>
  );
}

export function HoldingsSection({ holdings, totals }: HoldingsSectionProps) {
  const searchId = useId();
  const [searchTerm, setSearchTerm] = useState("");
  const [hideSmallBalances, setHideSmallBalances] = useState(true);
  const visibleHoldings = useMemo(
    () => filterHoldingPreviews(holdings, searchTerm, hideSmallBalances),
    [hideSmallBalances, holdings, searchTerm],
  );

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
              <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
            </svg>
            <input
              className="h-10 w-full rounded-lg border border-border bg-surface-interactive pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted hover:border-border-strong focus:border-brand focus:ring-2 focus:ring-focus/25"
              id={searchId}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search assets..."
              type="search"
              value={searchTerm}
            />
          </div>
        </div>
      </div>

      {visibleHoldings.length > 0 ? (
        <>
          <HoldingsTable holdings={visibleHoldings} />
          <HoldingCards holdings={visibleHoldings} />
        </>
      ) : (
        <div className="px-6 py-12 text-center" role="status">
          <p className="font-medium text-foreground">No matching holdings</p>
          <p className="mt-1 text-sm text-foreground-muted">Try another asset name or symbol.</p>
        </div>
      )}

      <PortfolioTotals totals={totals} />
    </section>
  );
}
