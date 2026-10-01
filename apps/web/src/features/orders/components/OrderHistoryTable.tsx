"use client";

import Link from "next/link";
import { useState } from "react";
import type { OrderListItem } from "@pulse-trade/contracts";

import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMarketPrice } from "@/lib/format/market-value";

import { useOrderHistory } from "../hooks/useOrderHistory";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

const statusPresentation: Record<
  OrderListItem["status"],
  { label: string; variant: BadgeVariant }
> = {
  CANCELLED: { label: "Cancelled", variant: "neutral" },
  FILLED: { label: "Filled", variant: "positive" },
  PENDING: { label: "Pending", variant: "warning" },
  REJECTED: { label: "Rejected", variant: "negative" },
};

function HistoryLoading() {
  return (
    <section
      aria-label="Order history loading"
      aria-live="polite"
      className="overflow-hidden rounded-lg border border-border bg-surface-elevated/80 shadow-panel"
      role="status"
    >
      <span className="sr-only">Loading order history</span>
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4 sm:px-6">
        <Skeleton className="h-5 w-28" variant="text" />
        <Skeleton className="h-7 w-24" variant="text" />
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        {[0, 1, 2].map((row) => (
          <Skeleton className="h-14" key={row} />
        ))}
      </div>
    </section>
  );
}

function SideBadge({ side }: Pick<OrderListItem, "side">) {
  return <Badge variant={side === "BUY" ? "positive" : "negative"}>{side}</Badge>;
}

function StatusBadge({ status }: Pick<OrderListItem, "status">) {
  const presentation = statusPresentation[status];

  return (
    <Badge showDot variant={presentation.variant}>
      {presentation.label}
    </Badge>
  );
}

function FormattedDate({ date }: { date: string | null }) {
  if (!date) return <span aria-label="Not available">—</span>;

  return <time dateTime={date}>{dateFormatter.format(new Date(date))}</time>;
}

function completionDate(order: OrderListItem): string | null {
  if (order.status === "FILLED") return order.filledAt;
  if (order.status === "CANCELLED") return order.cancelledAt;
  return null;
}

function HistoryRow({ order }: { order: OrderListItem }) {
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
        <SideBadge side={order.side} />
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
      <td className="px-3 py-4 text-right font-mono text-sm tabular-nums text-foreground">
        {order.avgFillPrice ? formatMarketPrice(order.avgFillPrice) : "—"}
      </td>
      <td className="px-3 py-4 text-center">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-3 py-4 text-right text-sm text-foreground-secondary">
        <FormattedDate date={order.createdAt} />
      </td>
      <td className="px-6 py-4 text-right text-sm text-foreground-secondary">
        <FormattedDate date={completionDate(order)} />
      </td>
    </tr>
  );
}

function HistoryData({ orders }: { orders: readonly OrderListItem[] }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table aria-label="Order history table" className="w-full min-w-[1120px] border-collapse">
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
            <th className="px-3 py-3.5 text-right font-medium" scope="col">
              Avg Fill Price
            </th>
            <th className="px-3 py-3.5 text-center font-medium" scope="col">
              Status
            </th>
            <th className="px-3 py-3.5 text-right font-medium" scope="col">
              Created
            </th>
            <th className="px-6 py-3.5 text-right font-medium" scope="col">
              Filled / Cancelled
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <HistoryRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderHistoryTable() {
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([undefined]);
  const currentCursor = pageCursors.at(-1);
  const currentPage = pageCursors.length;
  const query = useOrderHistory(currentCursor);
  const orders = query.data?.items ?? [];

  function showPreviousPage(): void {
    setPageCursors((cursors) => (cursors.length > 1 ? cursors.slice(0, -1) : cursors));
  }

  function showNextPage(): void {
    const nextCursor = query.data?.nextCursor;
    if (!nextCursor) return;
    setPageCursors((cursors) =>
      cursors.at(-1) === nextCursor ? cursors : [...cursors, nextCursor],
    );
  }

  if (query.isPending) return <HistoryLoading />;
  if (query.isError && orders.length === 0) {
    return (
      <ErrorState
        description="We couldn't load your paper-trading history. No orders or balances were changed."
        action={
          currentPage > 1 ? (
            <Button onClick={showPreviousPage} variant="secondary">
              Previous page
            </Button>
          ) : undefined
        }
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
        title="Order history unavailable"
      />
    );
  }

  return (
    <section
      aria-labelledby="order-history-heading"
      className="overflow-hidden rounded-lg border border-border bg-surface-elevated/80 shadow-panel"
    >
      <div className="flex flex-col gap-2 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-foreground" id="order-history-heading">
            Order History
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Your newest paper-trading orders appear first.
          </p>
        </div>
        <Badge className="self-start sm:self-auto">
          {currentPage === 1 ? "Newest first" : `Page ${currentPage}`}
        </Badge>
      </div>

      {orders.length > 0 ? (
        <>
          <HistoryData orders={orders} />
          <footer className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4 sm:px-6">
            <Button
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={showPreviousPage}
              size="sm"
              variant="secondary"
            >
              Previous
            </Button>
            <span className="text-sm text-foreground-muted">Page {currentPage}</span>
            <Button
              aria-label="Next page"
              disabled={!query.data?.nextCursor}
              onClick={showNextPage}
              size="sm"
              variant="secondary"
            >
              Next
            </Button>
          </footer>
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
            description="Place a paper order from any trading workspace and it will appear here."
            size="compact"
            title="You haven't placed any orders yet."
          />
        </div>
      )}
    </section>
  );
}
