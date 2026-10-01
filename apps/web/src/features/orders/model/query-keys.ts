import type { OrdersListQuery } from "@pulse-trade/contracts";

export const ordersQueryKeys = {
  all: ["orders"] as const,
  list: (query: Pick<OrdersListQuery, "cursor" | "side" | "status" | "symbol">) =>
    [...ordersQueryKeys.all, "list", query] as const,
};
