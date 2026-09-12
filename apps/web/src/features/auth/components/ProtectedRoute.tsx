"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { safeReturnTo } from "../model/return-to";
import { useAuthSession } from "./AuthSessionProvider";

const protectedPrefixes = ["/portfolio", "/orders", "/watchlist"] as const;

export function isProtectedPath(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function authRedirectPath(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function AuthRoutePanel({
  children,
  role = "status",
}: {
  children: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl items-center px-4 py-8 sm:px-6">
      <section
        role={role}
        aria-live="polite"
        className="w-full rounded-xl border border-border-subtle bg-surface-elevated p-6 text-center shadow-panel sm:p-8"
      >
        {children}
      </section>
    </main>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const auth = useAuthSession();
  const query = searchParams.toString();
  const returnTo = safeReturnTo(`${pathname}${query ? `?${query}` : ""}`);
  const loginPath = authRedirectPath(returnTo);

  useEffect(() => {
    if (auth.status === "unauthenticated") router.replace(loginPath);
  }, [auth.status, loginPath, router]);

  if (auth.status === "authenticated") return <>{children}</>;
  if (auth.status === "unavailable") {
    return (
      <AuthRoutePanel role="alert">
        <h1 className="text-xl font-semibold text-foreground">
          We couldn&apos;t verify your session
        </h1>
        <p className="mt-3 text-sm leading-6 text-foreground-secondary">
          Your account data is still protected. Check your connection and try again.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={auth.retry}>Try again</Button>
          <Link
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            href="/"
          >
            Back to markets
          </Link>
        </div>
      </AuthRoutePanel>
    );
  }
  if (auth.status === "unauthenticated") {
    return (
      <AuthRoutePanel>
        <h1 className="text-xl font-semibold text-foreground">Redirecting to sign in</h1>
        <p className="mt-3 text-sm text-foreground-secondary">
          You need to sign in before viewing this page.
        </p>
        <Link
          className="mt-5 inline-flex rounded text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          href={loginPath}
        >
          Continue to sign in
        </Link>
      </AuthRoutePanel>
    );
  }
  return (
    <AuthRoutePanel>
      <span
        aria-hidden="true"
        className="mx-auto block size-7 animate-spin rounded-full border-2 border-brand border-r-transparent motion-reduce:animate-none"
      />
      <h1 className="mt-4 text-xl font-semibold text-foreground">Checking your session</h1>
      <p className="mt-3 text-sm text-foreground-secondary">
        Your account data will appear once your session is verified.
      </p>
    </AuthRoutePanel>
  );
}

export function RouteAuthBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isProtectedPath(pathname) ? <ProtectedRoute>{children}</ProtectedRoute> : <>{children}</>;
}
