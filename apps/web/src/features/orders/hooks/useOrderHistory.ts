import { useQuery } from "@tanstack/react-query";
import type { OrdersListResponse } from "@pulse-trade/contracts";

import { useAuthSession } from "../../auth/components/AuthSessionProvider";
import { fetchOrders, OrdersRequestError } from "../api/orders";
import type { OrderFilters } from "../model/order-filters";
import { ordersQueryKeys } from "../model/query-keys";

export const ORDER_HISTORY_PAGE_SIZE = 20;

export function useOrderHistory(cursor: string | undefined, filters: OrderFilters = {}) {
  const session = useAuthSession();

  return useQuery<OrdersListResponse["data"], OrdersRequestError>({
    enabled: session.status === "authenticated",
    // Completed pages are evicted immediately so arbitrarily deep history browsing stays bounded.
    gcTime: 0,
    queryFn: ({ signal }) => {
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
          ...filters,
          cursor,
          limit: ORDER_HISTORY_PAGE_SIZE,
        },
        signal,
      );
    },
    queryKey: ordersQueryKeys.list({ ...filters, cursor }),
  });
}
