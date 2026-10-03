import type { OrderListItem } from "@pulse-trade/contracts";

import { Badge, type BadgeVariant } from "@/components/ui/Badge";

const statusPresentation: Record<
  OrderListItem["status"],
  { label: string; variant: BadgeVariant }
> = {
  CANCELLED: { label: "Cancelled", variant: "neutral" },
  FILLED: { label: "Filled", variant: "positive" },
  PENDING: { label: "Pending", variant: "warning" },
  REJECTED: { label: "Rejected", variant: "negative" },
};

export function OrderSideBadge({ side }: Pick<OrderListItem, "side">) {
  return <Badge variant={side === "BUY" ? "positive" : "negative"}>{side}</Badge>;
}

export function OrderStatusBadge({ status }: Pick<OrderListItem, "status">) {
  const presentation = statusPresentation[status];

  return (
    <Badge className="shrink-0" showDot variant={presentation.variant}>
      {presentation.label}
    </Badge>
  );
}
