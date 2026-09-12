import {
  loginRequestSchema,
  loginResponseSchema,
  type LoginRequest,
  type LoginResponse,
} from "@pulse-trade/contracts";

import { webEnvironment } from "../../../lib/env/server";

export async function loginUser(
  input: LoginRequest,
  signal?: AbortSignal,
): Promise<LoginResponse["data"]> {
  const payload = loginRequestSchema.parse({ email: input.email, password: input.password });
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(15_000);
    response = await fetch(`${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new Error("Unable to sign in. Check your connection and try again.");
  }
  // Status-based local messages never reveal account existence or provider/server details.
  if (!response.ok) {
    switch (response.status) {
      case 400:
        throw new Error("Enter a valid email and a password of 1–128 characters.");
      case 401:
        throw new Error("Email or password is incorrect.");
      case 403:
        throw new Error("Sign-in is not available from this site. Please contact support.");
      case 429:
        throw new Error("Too many sign-in attempts. Please wait a moment and try again.");
      default:
        throw new Error("Sign-in is temporarily unavailable. Please try again shortly.");
    }
  }
  const body: unknown = await response.json().catch(() => null);
  const result = loginResponseSchema.safeParse(body);
  if (!result.success) throw new Error("We couldn't confirm sign-in. Please try again.");
  return result.data.data;
}
