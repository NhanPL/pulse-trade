"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { OrderListItem } from "@pulse-trade/contracts";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMarketPrice } from "@/lib/format/market-value";

import { useOpenOrders } from "../hooks/useOpenOrders";
import { hasOrderFilters, type OrderFilters } from "../model/order-filters";
import { CancelOrderButton } from "./CancelOrderButton";
import { OrderSideBadge, OrderStatusBadge } from "./OrderBadges";
import { OrderCards } from "./OrderCards";
import { OrderTimestamp } from "./OrderTimestamp";

type OpenOrderFilters = Pick<OrderFilters, "side" | "symbol">;

function OpenOrdersLoading() {
  return (
    <section
      aria-label="Open orders loading"
      aria-live="polite"
      className="overflow-hidden rounded-lg border border-border bg-surface-elevated/80 shadow-panel"
      role="status"
    >
      <span className="sr-only">Loading open orders</span>
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4 sm:px-6">
        <Skeleton className="h-5 w-32" variant="text" />
        <Skeleton className="h-7 w-20" variant="text" />
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        {[0, 1, 2].map((row) => (
          <Skeleton className="h-64 md:h-14" key={row} />
        ))}
      </div>
    </section>
  );
}

function OpenOrderRow({
  order,
  onCancel,
}: {
  order: OrderListItem;
  onCancel: (order: OrderListItem) => void;
}) {
  return (
    <tr className="border-b border-border-subtle transition-colors last:border-b-0 hover:bg-surface-hover/45">
      <th className="px-6 py-4 text-left font-normal" scope="row">
        <Link
          aria-label={`Open ${order.symbol} trading workspace`}
          className="inline-flex flex-col rounded font-semibold text-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          href={`/trade/${order.symbol}`}
        >
          <span>{order.symbol.replace("-", " / ")}</span>
          <span className="mt-0.5 text-xs font-normal text-foreground-muted">Spot</span>
        </Link>
      </th>
      <td className="px-3 py-4">
        <OrderSideBadge side={order.side} />
      </td>
      <td className="px-3 py-4">
        <Badge>{order.type}</Badge>
      </td>
      <td className="px-3 py-4 text-right font-mono text-sm tabular-nums text-foreground">
        {order.quantity}
      </td>
      <td className="px-3 py-4 text-right font-mono text-sm tabular-nums text-foreground">
        {order.limitPrice ? formatMarketPrice(order.limitPrice) : "—"}
      </td>
      <td className="px-3 py-4 text-center">
        <OrderStatusBadge status={order.status} />
      </td>
      <td className="px-6 py-4 text-right text-sm text-foreground-secondary">
        <OrderTimestamp date={order.createdAt} />
      </td>
      <td className="px-6 py-4 text-right">
        <CancelOrderButton onCancel={onCancel} order={order} />
      </td>
    </tr>
  );
}

function OpenOrdersData({
  orders,
  onCancel,
}: {
  orders: readonly OrderListItem[];
  onCancel: (order: OrderListItem) => void;
}) {
  return (
    <div className="hidden max-w-full overflow-x-auto md:block">
      <table aria-label="Open orders table" className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr className="border-b border-border-subtle text-xs font-medium text-foreground-secondary">
            <th className="px-6 py-3.5 text-left font-medium" scope="col">
              Market
            </th>
            <th className="px-3 py-3.5 text-left font-medium" scope="col">
              Side
            </th>
            <th className="px-3 py-3.5 text-left font-medium" scope="col">
              Type
            </th>
            <th className="px-3 py-3.5 text-right font-medium" scope="col">
              Quantity
            </th>
            <th className="px-3 py-3.5 text-right font-medium" scope="col">
              Limit Price
            </th>
            <th className="px-3 py-3.5 text-center font-medium" scope="col">
              Status
            </th>
            <th className="px-6 py-3.5 text-right font-medium" scope="col">
              Created
            </th>
            <th className="px-6 py-3.5 text-right font-medium" scope="col">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OpenOrderRow key={order.id} onCancel={onCancel} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpenOrdersTable({
  filters = {},
  onCancel,
}: {
  filters?: OpenOrderFilters;
  onCancel: (order: OrderListItem) => void;
}) {
  const query = useOpenOrders(filters);
  const orders = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const isFiltered = hasOrderFilters(filters, false);

  if (query.isPending) return <OpenOrdersLoading />;
  if (query.isError && orders.length === 0) {
    return (
      <ErrorState
        description="We couldn't load your pending paper orders. No balances or orders were changed."
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
        title="Open orders unavailable"
      />
    );
  }

  return (
    <section
      aria-labelledby="open-orders-heading"
      className="overflow-hidden rounded-lg border border-border bg-surface-elevated/80 shadow-panel"
    >
      <div className="flex flex-col gap-2 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-foreground" id="open-orders-heading">
            Open Orders
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Pending limit orders with funds currently reserved.
          </p>
        </div>
        <Badge className="self-start sm:self-auto" showDot variant="warning">
          Pending
        </Badge>
      </div>

      {orders.length > 0 ? (
        <>
          <OpenOrdersData onCancel={onCancel} orders={orders} />
          <OrderCards onCancel={onCancel} orders={orders} view="open" />
          {query.hasNextPage || query.isFetchNextPageError ? (
            <footer className="flex flex-col items-center gap-2 border-t border-border-subtle px-5 py-4">
              {query.isFetchNextPageError ? (
                <p className="text-sm text-negative" role="alert">
                  We couldn&apos;t load the next page of open orders.
                </p>
              ) : null}
              <Button
                className="h-11 md:h-10"
                isLoading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                variant="secondary"
              >
                {query.isFetchingNextPage ? "Loading orders…" : "Load more orders"}
              </Button>
            </footer>
          ) : null}
        </>
      ) : (
        <div className="p-4 sm:p-6">
          <EmptyState
            action={
              <Link
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-foreground-inverse shadow-brand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                href="/"
              >
                Browse markets
              </Link>
            }
            description={
              isFiltered
                ? "Try changing or resetting the filters above."
                : "Create a limit order from a trading workspace and it will appear here while pending."
            }
            size="compact"
            title={isFiltered ? "No open orders match these filters." : "You have no open orders."}
          />
        </div>
      )}
    </section>
  );
}
