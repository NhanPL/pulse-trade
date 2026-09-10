import { SESSION_SECONDS } from "./session.service";

export function sessionCookie(
  refreshToken: string,
  production: boolean,
  maxAge = SESSION_SECONDS,
): string {
  return `pulse_trade_refresh=${encodeURIComponent(refreshToken)}; Path=/api/v1/auth; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${production ? "; Secure" : ""}`;
}

export function readRefreshCookie(header: string | undefined): string | undefined {
  const matches =
    header
      ?.split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("pulse_trade_refresh=")) ?? [];
  // Duplicate cookies can arise from conflicting paths; do not guess which is identity.
  if (matches.length !== 1) return undefined;
  try {
    const token = decodeURIComponent(matches[0].slice("pulse_trade_refresh=".length));
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

export function clearSessionCookie(production: boolean): string {
  return `${sessionCookie("", production, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
