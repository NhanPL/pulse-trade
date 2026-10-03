import Link from "next/link";
import type { ReactNode } from "react";
import type { OrderListItem } from "@pulse-trade/contracts";

import { Badge } from "@/components/ui/Badge";
import { formatMarketPrice } from "@/lib/format/market-value";

import { CancelOrderButton } from "./CancelOrderButton";
import { OrderSideBadge, OrderStatusBadge } from "./OrderBadges";
import { OrderCompletionTimestamp, OrderTimestamp } from "./OrderTimestamp";

type OrderCardsProps = {
  onCancel: (order: OrderListItem) => void;
  orders: readonly OrderListItem[];
  view: "open" | "history";
};

function CardField({
  children,
  label,
  fullWidth = false,
}: {
  children: ReactNode;
  label: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

export function OrderCards({ onCancel, orders, view }: OrderCardsProps) {
  return (
    <ul
      aria-label={view === "open" ? "Open orders cards" : "Order history cards"}
      className="grid gap-3 p-3 md:hidden"
    >
      {orders.map((order) => (
        <li
          aria-label={`${order.symbol} ${order.side} ${order.type} order`}
          className="min-w-0 rounded-lg border border-border-subtle bg-surface/35 p-4"
          key={order.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              aria-label={`Open ${order.symbol} trading workspace`}
              className="inline-flex min-h-11 flex-col justify-center rounded font-semibold text-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              href={`/trade/${order.symbol}`}
            >
              <span>{order.symbol.replace("-", " / ")}</span>
              <span className="mt-0.5 text-xs font-normal text-foreground-muted">Spot</span>
            </Link>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <OrderSideBadge side={order.side} />
            <Badge>{order.type}</Badge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4">
            <CardField fullWidth label="Quantity">
              {order.quantity} {order.symbol.split("-")[0]}
            </CardField>
            <CardField fullWidth={view === "open"} label="Limit Price">
              {order.limitPrice ? formatMarketPrice(order.limitPrice) : "—"}
            </CardField>
            {view === "history" ? (
              <CardField label="Avg Fill Price">
                {order.avgFillPrice ? formatMarketPrice(order.avgFillPrice) : "—"}
              </CardField>
            ) : null}
            <CardField fullWidth label="Created">
              <OrderTimestamp date={order.createdAt} />
            </CardField>
            {view === "history" ? (
              <CardField fullWidth label="Filled / Cancelled">
                <OrderCompletionTimestamp order={order} />
              </CardField>
            ) : null}
          </dl>
          <CancelOrderButton
            className="mt-4 h-11 w-full"
            onCancel={onCancel}
            order={order}
            unavailableFallback={null}
          />
        </li>
      ))}
    </ul>
  );
}
