import { SESSION_SECONDS } from "./session.service";

export function sessionCookie(refreshToken: string, production: boolean): string {
  return `pulse_trade_refresh=${encodeURIComponent(refreshToken)}; Path=/api/v1/auth; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Lax${production ? "; Secure" : ""}`;
}
