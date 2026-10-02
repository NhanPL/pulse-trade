import { useInfiniteQuery } from "@tanstack/react-query";
import type { OrdersListResponse } from "@pulse-trade/contracts";

import { useAuthSession } from "../../auth/components/AuthSessionProvider";
import { fetchOrders, OrdersRequestError } from "../api/orders";
import type { OrderFilters } from "../model/order-filters";
import { ordersQueryKeys } from "../model/query-keys";

export const OPEN_ORDERS_PAGE_SIZE = 20;
type OpenOrderFilters = Pick<OrderFilters, "side" | "symbol">;

export function useOpenOrders(filters: OpenOrderFilters = {}) {
  const session = useAuthSession();
  const openOrdersQuery = { ...filters, status: "PENDING" as const };

  return useInfiniteQuery<OrdersListResponse["data"], OrdersRequestError>({
    enabled: session.status === "authenticated",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const accessToken = session.getAccessToken();
      if (!accessToken) {
        throw new OrdersRequestError(
          "UNAUTHENTICATED",
          "Your session has expired. Sign in again to continue.",
        );
      }
      return fetchOrders(
        accessToken,
        {
          ...openOrdersQuery,
          cursor: typeof pageParam === "string" ? pageParam : undefined,
          limit: OPEN_ORDERS_PAGE_SIZE,
        },
        signal,
      );
    },
    queryKey: ordersQueryKeys.list(openOrdersQuery),
  });
}
