"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";

import { Button } from "@/components/ui/Button";
import {
  SUPPORTED_MARKETS,
  isSupportedMarketSymbol,
} from "@/features/market/model/supported-markets";

import { hasOrderFilters, type OrderFilters } from "../model/order-filters";

type OrdersFiltersProps = {
  activeTab: "history" | "open";
  filters: OrderFilters;
  onChange: (filters: OrderFilters) => void;
  onReset: () => void;
};

type FilterSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  id: string;
  label: string;
};

function FilterSelect({ children, id, label, ...props }: FilterSelectProps) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground" htmlFor={id}>
      {label}
      <span className="relative">
        <select
          {...props}
          className="h-11 w-full appearance-none rounded-lg border border-border bg-surface-interactive px-3 pr-9 text-sm text-foreground outline-none transition-colors hover:border-border-strong focus:border-brand focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-disabled disabled:opacity-70"
          id={id}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="m7 10 5 5 5-5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
        </svg>
      </span>
    </label>
  );
}

export function OrdersFilters({ activeTab, filters, onChange, onReset }: OrdersFiltersProps) {
  const statusIsFixed = activeTab === "open";
  const hasVisibleFilters = hasOrderFilters(filters, !statusIsFixed);

  return (
    <section
      aria-label="Order filters"
      className="mt-5 grid gap-4 rounded-lg border border-border bg-surface-elevated/65 p-4 shadow-panel sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:items-end"
    >
      <FilterSelect
        id="orders-symbol-filter"
        label="Symbol"
        onChange={(event) => {
          const symbol = event.target.value;
          onChange({
            ...filters,
            symbol: isSupportedMarketSymbol(symbol) ? symbol : undefined,
          });
        }}
        value={filters.symbol ?? ""}
      >
        <option value="">All symbols</option>
        {SUPPORTED_MARKETS.map((market) => (
          <option key={market.symbol} value={market.symbol}>
            {market.baseAsset} / {market.quoteAsset}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        id="orders-side-filter"
        label="Side"
        onChange={(event) => {
          const side = event.target.value;
          onChange({
            ...filters,
            side: side === "BUY" || side === "SELL" ? side : undefined,
          });
        }}
        value={filters.side ?? ""}
      >
        <option value="">All sides</option>
        <option value="BUY">Buy</option>
        <option value="SELL">Sell</option>
      </FilterSelect>

      <FilterSelect
        disabled={statusIsFixed}
        id="orders-status-filter"
        label="Status"
        onChange={(event) => {
          const status = event.target.value;
          onChange({
            ...filters,
            status:
              status === "PENDING" ||
              status === "FILLED" ||
              status === "CANCELLED" ||
              status === "REJECTED"
                ? status
                : undefined,
          });
        }}
        title={statusIsFixed ? "Open Orders always shows pending orders" : undefined}
        value={statusIsFixed ? "PENDING" : (filters.status ?? "")}
      >
        <option value="">All statuses</option>
        <option value="PENDING">Pending</option>
        <option value="FILLED">Filled</option>
        <option value="CANCELLED">Cancelled</option>
        <option value="REJECTED">Rejected</option>
      </FilterSelect>

      <Button disabled={!hasVisibleFilters} onClick={onReset} variant="secondary">
        Reset filters
      </Button>
    </section>
  );
}
