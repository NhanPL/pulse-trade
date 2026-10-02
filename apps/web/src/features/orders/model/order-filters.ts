import type { OrdersListQuery } from "@pulse-trade/contracts";

export type OrderFilters = Readonly<Pick<OrdersListQuery, "side" | "status" | "symbol">>;

export function hasOrderFilters(filters: OrderFilters, includeStatus = true): boolean {
  return Boolean(filters.side || filters.symbol || (includeStatus && filters.status));
}
