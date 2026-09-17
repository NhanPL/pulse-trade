import {
  marketOrderRequestSchema,
  marketOrderResponseSchema,
  type MarketOrderRequest,
  type MarketOrderResponse,
} from "@pulse-trade/contracts";
import { z } from "zod";

import { webEnvironment } from "../../../lib/env/server";

const errorResponseSchema = z.object({
  error: z.object({ code: z.string() }),
});

const submissionErrorCodes = [
  "INVALID_ORDER",
  "INVALID_QUANTITY",
  "INSUFFICIENT_BALANCE",
  "MARKET_DATA_STALE",
  "MARKET_DATA_UNAVAILABLE",
  "ORDER_CONFLICT",
  "ORDER_UNAVAILABLE",
  "UNAUTHENTICATED",
  "UNSUPPORTED_SYMBOL",
] as const;

export type MarketOrderSubmissionErrorCode = (typeof submissionErrorCodes)[number];

export type SubmitMarketOrderInput = MarketOrderRequest &
  Readonly<{
    accessToken: string;
    signal?: AbortSignal;
  }>;

export class MarketOrderSubmissionError extends Error {
  constructor(readonly code: MarketOrderSubmissionErrorCode) {
    super(marketOrderSubmissionMessage(code));
    this.name = "MarketOrderSubmissionError";
  }
}

export function marketOrderSubmissionMessage(code: MarketOrderSubmissionErrorCode): string {
  switch (code) {
    case "INVALID_QUANTITY":
      return "Enter a positive quantity using a fixed-point decimal value.";
    case "MARKET_DATA_STALE":
    case "MARKET_DATA_UNAVAILABLE":
      return "Live market data is temporarily unavailable. Wait for a live update and try again.";
    case "UNAUTHENTICATED":
      return "Your sign-in session has expired. Sign in again to place an order.";
    case "INVALID_ORDER":
    case "INSUFFICIENT_BALANCE":
    case "ORDER_CONFLICT":
    case "UNSUPPORTED_SYMBOL":
      return "This order could not be placed. Review the order details and try again.";
    case "ORDER_UNAVAILABLE":
      return "Order placement is temporarily unavailable. Check your connection and try again.";
  }
}

export async function submitMarketOrder({
  accessToken,
  signal,
  ...order
}: SubmitMarketOrderInput): Promise<MarketOrderResponse["data"]> {
  const request = marketOrderRequestSchema.safeParse(order);
  if (!request.success) {
    const code = request.error.flatten().fieldErrors.quantity
      ? "INVALID_QUANTITY"
      : "INVALID_ORDER";
    throw new MarketOrderSubmissionError(code);
  }

  let response: Response;
  try {
    const timeout = AbortSignal.timeout(15_000);
    response = await fetch(`${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/orders`, {
      body: JSON.stringify(request.data),
      cache: "no-store",
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new MarketOrderSubmissionError("ORDER_UNAVAILABLE");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MarketOrderSubmissionError(errorCodeFor(response.status, body));
  }

  const result = marketOrderResponseSchema.safeParse(body);
  if (!result.success) throw new MarketOrderSubmissionError("ORDER_UNAVAILABLE");
  return result.data.data;
}

function errorCodeFor(status: number, body: unknown): MarketOrderSubmissionErrorCode {
  if (status === 401) return "UNAUTHENTICATED";

  const result = errorResponseSchema.safeParse(body);
  if (!result.success || !isSubmissionErrorCode(result.data.error.code)) {
    return "ORDER_UNAVAILABLE";
  }
  return result.data.error.code;
}

function isSubmissionErrorCode(value: string): value is MarketOrderSubmissionErrorCode {
  return submissionErrorCodes.some((code) => code === value);
}
