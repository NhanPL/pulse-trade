import type { BadgeVariant } from "../ui/Badge";

export type ConnectionStatus = "live" | "connecting" | "reconnecting" | "delayed" | "offline";

export type NavigationItem = {
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
};

export const publicNavigationItems: NavigationItem[] = [
  {
    href: "/",
    label: "Markets",
    matches: (pathname) => pathname === "/" || pathname.startsWith("/trade/"),
  },
];

export const protectedNavigationItems: NavigationItem[] = [
  { href: "/portfolio", label: "Portfolio", matches: (pathname) => pathname === "/portfolio" },
  { href: "/orders", label: "Orders", matches: (pathname) => pathname === "/orders" },
  { href: "/watchlist", label: "Watchlist", matches: (pathname) => pathname === "/watchlist" },
];

export const connectionPresentation: Record<
  ConnectionStatus,
  { label: string; variant: BadgeVariant }
> = {
  live: { label: "Live", variant: "positive" },
  connecting: { label: "Connecting", variant: "info" },
  reconnecting: { label: "Reconnecting", variant: "warning" },
  delayed: { label: "Delayed", variant: "warning" },
  offline: { label: "Offline", variant: "negative" },
};

export function getNavigationItems(isAuthenticated: boolean): NavigationItem[] {
  return isAuthenticated
    ? [...publicNavigationItems, ...protectedNavigationItems]
    : publicNavigationItems;
}
