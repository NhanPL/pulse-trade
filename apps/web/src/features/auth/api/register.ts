import {
  registerRequestSchema,
  registerResponseSchema,
  type RegisterRequest,
} from "@pulse-trade/contracts";
import { z } from "zod";

import { webEnvironment } from "../../../lib/env/server";

const errorSchema = z.object({ error: z.object({ code: z.string() }) });
const messages: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: "An account with this email already exists. Sign in to continue.",
  INVALID_REGISTRATION: "Check your email and use a password between 8 and 128 characters.",
  REGISTRATION_UNAVAILABLE: "Registration is temporarily unavailable. Please try again shortly.",
};

export async function registerUser(input: RegisterRequest, signal?: AbortSignal): Promise<void> {
  const payload = registerRequestSchema.parse({ email: input.email, password: input.password });
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(15_000);
    response = await fetch(
      `${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify(payload),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
  } catch {
    throw new Error(
      "We couldn't confirm registration. Check your connection and try again. If your account was created, sign in.",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorSchema.safeParse(body);
    const message =
      response.status === 429
        ? "Too many attempts. Please wait a moment before trying again."
        : error.success
          ? messages[error.data.error.code]
          : undefined;
    throw new Error(message ?? "We couldn't create your account. Please try again shortly.");
  }
  if (!registerResponseSchema.safeParse(body).success) {
    throw new Error(
      "We couldn't confirm registration. Your account may have been created; try signing in.",
    );
  }
}
