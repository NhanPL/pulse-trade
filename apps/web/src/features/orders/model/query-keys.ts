import type { OrdersListQuery } from "@pulse-trade/contracts";

export const ordersQueryKeys = {
  all: ["orders"] as const,
  list: (query: Pick<OrdersListQuery, "side" | "status" | "symbol">) =>
    [...ordersQueryKeys.all, "list", query] as const,
};
