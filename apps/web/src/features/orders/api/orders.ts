import {
  cancelOrderParamsSchema,
  cancelOrderResponseSchema,
  type CancelOrderResponse,
  ordersListQuerySchema,
  ordersListResponseSchema,
  type OrdersListQuery,
  type OrdersListResponse,
} from "@pulse-trade/contracts";
import { z } from "zod";

import { webEnvironment } from "../../../lib/env/server";

const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });

export class OrdersRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OrdersRequestError";
  }
}

export async function cancelOrder(
  accessToken: string,
  id: string,
): Promise<CancelOrderResponse["data"]> {
  if (!cancelOrderParamsSchema.safeParse({ id }).success) {
    throw new OrdersRequestError("INVALID_ORDER", "This order could not be identified.");
  }

  let response: Response;
  try {
    response = await fetch(
      `${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/orders/${id}/cancel`,
      {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new OrdersRequestError(
      "CANCELLATION_UNAVAILABLE",
      "We couldn't confirm cancellation. Refresh your orders before trying again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorResponseSchema.safeParse(body);
    const code = error.success
      ? error.data.error.code
      : response.status === 401
        ? "UNAUTHENTICATED"
        : "CANCELLATION_UNAVAILABLE";
    throw new OrdersRequestError(
      code,
      code === "UNAUTHENTICATED"
        ? "Your session has expired. Sign in again to continue."
        : "We couldn't cancel this order. Refresh your orders before trying again.",
    );
  }

  const result = cancelOrderResponseSchema.safeParse(body);
  if (!result.success || result.data.data.id !== id) {
    throw new OrdersRequestError(
      "CANCELLATION_UNAVAILABLE",
      "We couldn't verify cancellation. Refresh your orders before trying again.",
    );
  }
  return result.data.data;
}

export async function fetchOrders(
  accessToken: string,
  query: OrdersListQuery,
  signal?: AbortSignal,
): Promise<OrdersListResponse["data"]> {
  const parsedQuery = ordersListQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    throw new OrdersRequestError(
      "INVALID_ORDERS_QUERY",
      "The order list request contains invalid filters or pagination values.",
    );
  }

  const search = new URLSearchParams();
  search.set("limit", parsedQuery.data.limit.toString());
  if (parsedQuery.data.cursor) search.set("cursor", parsedQuery.data.cursor);
  if (parsedQuery.data.side) search.set("side", parsedQuery.data.side);
  if (parsedQuery.data.status) search.set("status", parsedQuery.data.status);
  if (parsedQuery.data.symbol) search.set("symbol", parsedQuery.data.symbol);

  let response: Response;
  try {
    const timeout = AbortSignal.timeout(15_000);
    response = await fetch(
      `${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/orders?${search.toString()}`,
      {
        cache: "no-store",
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new OrdersRequestError(
      "ORDERS_UNAVAILABLE",
      "We couldn't load your orders. Check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(body);
    const code = parsedError.success
      ? parsedError.data.error.code
      : response.status === 401
        ? "UNAUTHENTICATED"
        : "ORDERS_UNAVAILABLE";
    throw new OrdersRequestError(code, messageFor(code));
  }

  const result = ordersListResponseSchema.safeParse(body);
  if (!result.success) {
    throw new OrdersRequestError(
      "ORDERS_UNAVAILABLE",
      "We couldn't verify the order data returned by the server.",
    );
  }

  return result.data.data;
}

function messageFor(code: string): string {
  if (code === "UNAUTHENTICATED") return "Your session has expired. Sign in again to continue.";
  if (code === "INVALID_CURSOR") return "This orders page is no longer available. Reload the list.";
  return "Your orders are temporarily unavailable. Please try again shortly.";
}
