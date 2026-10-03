import type { OrderListItem } from "@pulse-trade/contracts";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { classNames } from "@/components/ui/class-names";

export function CancelOrderButton({
  className,
  onCancel,
  order,
  unavailableFallback = <span>—</span>,
}: {
  className?: string;
  onCancel: (order: OrderListItem) => void;
  order: OrderListItem;
  unavailableFallback?: ReactNode;
}) {
  if (order.type !== "LIMIT" || order.status !== "PENDING") return unavailableFallback;

  return (
    <Button
      aria-label={`Cancel ${order.symbol} ${order.side} order`}
      className={classNames("border-negative/50 text-negative hover:border-negative", className)}
      onClick={() => onCancel(order)}
      size="sm"
      variant="secondary"
    >
      Cancel
    </Button>
  );
}
