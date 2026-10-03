import type { OrderListItem } from "@pulse-trade/contracts";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  year: "numeric",
});

export function OrderTimestamp({ date }: { date: string | null }) {
  if (!date) return <span aria-label="Not available">—</span>;

  return <time dateTime={date}>{dateFormatter.format(new Date(date))}</time>;
}

export function OrderCompletionTimestamp({ order }: { order: OrderListItem }) {
  const date =
    order.status === "FILLED"
      ? order.filledAt
      : order.status === "CANCELLED"
        ? order.cancelledAt
        : null;

  return <OrderTimestamp date={date} />;
}
