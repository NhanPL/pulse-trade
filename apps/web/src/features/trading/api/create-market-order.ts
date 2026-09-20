import {
  marketOrderRequestSchema,
  marketOrderResponseSchema,
  type MarketOrderRequest,
  type MarketOrderResponse,
} from "@pulse-trade/contracts";
import { z } from "zod";

import { webEnvironment } from "../../../lib/env/server";

const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });

export class CreateMarketOrderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CreateMarketOrderError";
  }
}

export async function createMarketOrder(
  input: MarketOrderRequest,
  accessToken: string,
  signal?: AbortSignal,
): Promise<MarketOrderResponse["data"]> {
  const payload = marketOrderRequestSchema.parse(input);
  let response: Response;

  try {
    const timeout = AbortSignal.timeout(15_000);
    response = await fetch(`${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new CreateMarketOrderError(
      "ORDER_UNAVAILABLE",
      "We couldn't place your order. Check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorResponseSchema.safeParse(body);
    const code = error.success ? error.data.error.code : codeForStatus(response.status);
    throw new CreateMarketOrderError(code, messageFor(code));
  }

  const result = marketOrderResponseSchema.safeParse(body);
  if (!result.success) {
    throw new CreateMarketOrderError(
      "ORDER_UNAVAILABLE",
      "We couldn't confirm that your order was placed. Please check your orders before trying again.",
    );
  }
  return result.data.data;
}

function codeForStatus(status: number): string {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 409) return "ORDER_CONFLICT";
  return "ORDER_UNAVAILABLE";
}

function messageFor(code: string): string {
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      return "Your available balance is not enough for this order.";
    case "INVALID_QUANTITY":
      return "Enter a positive quantity.";
    case "MARKET_DATA_STALE":
      return "Market data is delayed. Wait for a live update and try again.";
    case "MARKET_DATA_UNAVAILABLE":
      return "Market data is unavailable. Please try again shortly.";
    case "ORDER_CONFLICT":
      return "Your balances changed before the order could be placed. Review the quantity and try again.";
    case "UNAUTHENTICATED":
      return "Your session has expired. Sign in again to place an order.";
    default:
      return "Order placement is temporarily unavailable. Please try again shortly.";
  }
}
