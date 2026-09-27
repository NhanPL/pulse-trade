import {
  limitBuyOrderRequestSchema,
  limitBuyOrderResponseSchema,
  limitSellOrderRequestSchema,
  limitSellOrderResponseSchema,
  type LimitBuyOrderRequest,
  type LimitBuyOrderResponse,
  type LimitSellOrderRequest,
  type LimitSellOrderResponse,
} from "@pulse-trade/contracts";
import { z } from "zod";

import { webEnvironment } from "../../../lib/env/server";

type LimitOrderRequest = LimitBuyOrderRequest | LimitSellOrderRequest;
type LimitOrder = LimitBuyOrderResponse["data"] | LimitSellOrderResponse["data"];

const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });

export class CreateLimitOrderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CreateLimitOrderError";
  }
}

export async function createLimitOrder(
  input: LimitOrderRequest,
  accessToken: string,
  signal?: AbortSignal,
): Promise<LimitOrder> {
  const payload =
    input.side === "BUY"
      ? limitBuyOrderRequestSchema.parse(input)
      : limitSellOrderRequestSchema.parse(input);
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
    throw new CreateLimitOrderError(
      "ORDER_UNAVAILABLE",
      "We couldn't place your limit order. Check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorResponseSchema.safeParse(body);
    const code = error.success ? error.data.error.code : codeForStatus(response.status);
    throw new CreateLimitOrderError(code, messageFor(code));
  }

  const result =
    input.side === "BUY"
      ? limitBuyOrderResponseSchema.safeParse(body)
      : limitSellOrderResponseSchema.safeParse(body);
  if (!result.success) {
    throw new CreateLimitOrderError(
      "ORDER_UNAVAILABLE",
      "We couldn't confirm that your limit order was placed. Please check your orders before trying again.",
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
    case "INVALID_LIMIT_PRICE":
      return "Enter a positive limit price using a fixed-point decimal value.";
    case "INVALID_QUANTITY":
      return "Enter a positive quantity.";
    case "ORDER_CONFLICT":
      return "Your balances changed before the order could be placed. Review the order and try again.";
    case "UNAUTHENTICATED":
      return "Your session has expired. Sign in again to place an order.";
    default:
      return "Limit order placement is temporarily unavailable. Please try again shortly.";
  }
}
