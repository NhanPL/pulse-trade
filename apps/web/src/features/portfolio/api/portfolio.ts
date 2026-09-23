import { portfolioResponseSchema, type PortfolioResponse } from "@pulse-trade/contracts";
import { z } from "zod";

import { webEnvironment } from "../../../lib/env/server";

const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });

export class PortfolioRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PortfolioRequestError";
  }
}

export async function fetchPortfolio(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PortfolioResponse["data"]> {
  let response: Response;

  try {
    const timeout = AbortSignal.timeout(15_000);
    response = await fetch(`${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/portfolio`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      credentials: "include",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PortfolioRequestError(
      "PORTFOLIO_UNAVAILABLE",
      "We couldn't load your portfolio. Check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(body);
    const code = parsedError.success
      ? parsedError.data.error.code
      : response.status === 401
        ? "UNAUTHENTICATED"
        : "PORTFOLIO_UNAVAILABLE";
    throw new PortfolioRequestError(code, messageFor(code));
  }

  const result = portfolioResponseSchema.safeParse(body);
  if (!result.success) {
    throw new PortfolioRequestError(
      "PORTFOLIO_UNAVAILABLE",
      "We couldn't verify the portfolio data returned by the server.",
    );
  }

  return result.data.data;
}

function messageFor(code: string): string {
  if (code === "UNAUTHENTICATED") return "Your session has expired. Sign in again to continue.";
  return "Your portfolio is temporarily unavailable. Please try again shortly.";
}
