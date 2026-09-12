"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRealtimeConnectionState } from "@/features/realtime/stores/connection-state-store";
import { useAuthSession } from "@/features/auth/components/AuthSessionProvider";

import { AppHeader } from "./AppHeader";
import { BrandLink } from "./BrandLink";

export function RouteHeader() {
  const pathname = usePathname();
  if (pathname !== "/register" && pathname !== "/login") return <SessionHeader />;
  return (
    <header className="h-16 border-b border-border-subtle bg-header/95">
      <div className="mx-auto flex h-full max-w-[1586px] items-center justify-between gap-4 px-4 sm:px-8">
        <BrandLink />
        <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm sm:gap-8">
          <Link
            href="/"
            className="rounded text-foreground-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Markets
          </Link>
          <Link
            href={pathname === "/login" ? "/register" : "/login"}
            className="rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {pathname === "/login" ? "Register" : "Login"}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SessionHeader() {
  const { status: authStatus, user } = useAuthSession();
  const connection = useRealtimeConnectionState();
  if (authStatus !== "authenticated" || !user) return <AppHeader authState="guest" />;
  const connectionStatus = {
    CONNECTED: "live",
    CONNECTING: "connecting",
    RECONNECTING: "reconnecting",
    DISCONNECTED: "offline",
  } as const;
  return (
    <AppHeader
      authState="authenticated"
      userLabel={user.email}
      connectionStatus={connectionStatus[connection]}
    />
  );
}
