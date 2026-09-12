import { webEnvironment } from "../../../lib/env/server";

export async function logoutUser(accessToken: string | null): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: "include",
      cache: "no-store",
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Unable to sign out. Check your connection and try again.");
  }

  if (response.status === 204) return;

  // The API does not expose session details; retain local state so the user can retry.
  switch (response.status) {
    case 403:
      throw new Error("Sign-out is not available from this site. Please contact support.");
    default:
      throw new Error("Sign-out is temporarily unavailable. Please try again shortly.");
  }
}
