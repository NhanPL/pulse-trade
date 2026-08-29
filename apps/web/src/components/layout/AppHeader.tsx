import Link from "next/link";

import { Badge } from "../ui/Badge";
import { BrandLink } from "./BrandLink";
import { DesktopNav } from "./DesktopNav";
import { connectionPresentation, type ConnectionStatus } from "./header-config";
import { MobileNav } from "./MobileNav";

export type { ConnectionStatus } from "./header-config";

type GuestHeaderProps = {
  authState: "guest";
};

type AuthenticatedHeaderProps = {
  authState: "authenticated";
  connectionStatus: ConnectionStatus;
  userLabel: string;
};

export type AppHeaderProps = GuestHeaderProps | AuthenticatedHeaderProps;

function getInitials(label: string): string {
  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "PT";
}

export function AppHeader(props: AppHeaderProps) {
  const isAuthenticated = props.authState === "authenticated";

  return (
    <>
      <header className="hidden h-16 border-b border-border-subtle bg-header/95 backdrop-blur md:block">
        <div className="mx-auto flex h-full max-w-[1440px] items-center gap-8 px-6 lg:px-8">
          <BrandLink />
          <DesktopNav isAuthenticated={isAuthenticated} />

          <div className="ml-auto flex items-center gap-3">
            {props.authState === "guest" ? (
              <>
                <Link
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  href="/login"
                >
                  Log in
                </Link>
                <Link
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground-inverse shadow-brand transition-colors hover:bg-brand-hover active:bg-brand-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-header"
                  href="/register"
                >
                  Create account
                </Link>
              </>
            ) : (
              <>
                <Badge
                  aria-label={`Market data: ${connectionPresentation[props.connectionStatus].label}`}
                  showDot
                  variant={connectionPresentation[props.connectionStatus].variant}
                >
                  {connectionPresentation[props.connectionStatus].label}
                </Badge>
                <div className="flex items-center gap-2 border-l border-border-subtle pl-3">
                  <span
                    aria-hidden="true"
                    className="grid size-8 place-items-center rounded-full bg-brand-subtle text-xs font-bold text-brand"
                  >
                    {getInitials(props.userLabel)}
                  </span>
                  <span className="max-w-40 truncate text-sm font-medium text-foreground-secondary">
                    {props.userLabel}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <MobileNav
        isAuthenticated={isAuthenticated}
        connectionStatus={props.authState === "authenticated" ? props.connectionStatus : undefined}
      />
    </>
  );
}
