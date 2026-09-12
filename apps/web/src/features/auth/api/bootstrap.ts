import {
  meResponseSchema,
  refreshResponseSchema,
  type LoginResponse,
  type MeResponse,
} from "@pulse-trade/contracts";

import { webEnvironment } from "../../../lib/env/server";

export type BootstrapResult =
  | { kind: "authenticated"; session: LoginResponse["data"]; user: MeResponse["data"]["user"] }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

const apiBaseUrl = webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "");

async function request(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, cache: "no-store", credentials: "include" });
  } catch {
    return null;
  }
}

export async function bootstrapSession(): Promise<BootstrapResult> {
  // Refresh rotates the HttpOnly credential, so the caller must serialize calls to this function.
  const refresh = await request(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  if (!refresh) return { kind: "unavailable" };
  if (refresh.status === 400 || refresh.status === 401) return { kind: "unauthenticated" };
  if (!refresh.ok) return { kind: "unavailable" };

  const refreshBody: unknown = await refresh.json().catch(() => null);
  const refreshResult = refreshResponseSchema.safeParse(refreshBody);
  if (!refreshResult.success) return { kind: "unavailable" };

  const me = await request(`${apiBaseUrl.replace(/\/api\/v1$/, "")}/me`, {
    headers: { Authorization: `Bearer ${refreshResult.data.data.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!me) return { kind: "unavailable" };
  if (me.status === 401) return { kind: "unauthenticated" };
  if (!me.ok) return { kind: "unavailable" };

  const meBody: unknown = await me.json().catch(() => null);
  const meResult = meResponseSchema.safeParse(meBody);
  if (!meResult.success) return { kind: "unavailable" };
  const session = refreshResult.data.data;
  const user = meResult.data.data.user;
  // `/me` is the source of the current identity after session revocation checks.
  if (session.user.id !== user.id || session.user.email !== user.email)
    return { kind: "unavailable" };
  return { kind: "authenticated", session, user };
}
