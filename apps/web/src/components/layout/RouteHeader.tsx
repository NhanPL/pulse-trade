"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppHeader } from "./AppHeader";
import { BrandLink } from "./BrandLink";

export function RouteHeader() {
  const pathname = usePathname();
  if (pathname !== "/register") return <AppHeader authState="guest" />;
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
            href="/login"
            className="rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
