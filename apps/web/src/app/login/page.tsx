import type { Metadata } from "next";

import { BrandLink } from "@/components/layout/BrandLink";
import { AuthIcon } from "@/features/auth/components/AuthIcon";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { safeReturnTo } from "@/features/auth/model/return-to";

export const metadata: Metadata = { title: "Sign in | PulseTrade" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; registered?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <main className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(3,10,22,0.65),rgba(3,10,22,0.75)),url('/images/auth-background.png')] bg-cover bg-center"
      />
      <section
        aria-labelledby="login-title"
        className="w-full max-w-[564px] rounded-xl border border-border-strong/80 bg-surface/90 p-5 shadow-panel backdrop-blur-sm sm:p-10"
      >
        <div className="mb-8 flex justify-center">
          <BrandLink />
        </div>
        <h1 id="login-title" className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back
        </h1>
        <p className="mb-8 mt-4 text-center text-sm leading-6 text-foreground-secondary sm:text-base">
          Sign in to access your account and practice trading with real-time market data.
        </p>
        {params.registered === "1" ? (
          <p
            role="status"
            className="mb-6 rounded-lg border border-positive/25 bg-positive-subtle/30 p-4 text-sm text-positive"
          >
            Account created. Sign in to start paper trading with your $10,000 virtual USD.
          </p>
        ) : null}
        <LoginForm returnTo={safeReturnTo(params.returnTo)} />
        <div className="mt-8 flex items-center gap-4 rounded-lg border border-border-subtle bg-canvas/20 p-4">
          <span className="shrink-0 text-brand">
            <AuthIcon name="shield" className="size-8" />
          </span>
          <p className="text-sm leading-6 text-foreground-secondary">
            Sign in for paper trading, live market data, and portfolio tracking. No real money is
            traded.
          </p>
        </div>
      </section>
    </main>
  );
}
