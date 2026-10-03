import type { OrderListItem } from "@pulse-trade/contracts";

import { Button } from "@/components/ui/Button";

export function CancelOrderButton({
  onCancel,
  order,
}: {
  onCancel: (order: OrderListItem) => void;
  order: OrderListItem;
}) {
  if (order.type !== "LIMIT" || order.status !== "PENDING") return <span>—</span>;

  return (
    <Button
      aria-label={`Cancel ${order.symbol} ${order.side} order`}
      className="border-negative/50 text-negative hover:border-negative"
      onClick={() => onCancel(order)}
      size="sm"
      variant="secondary"
    >
      Cancel
    </Button>
  );
}
