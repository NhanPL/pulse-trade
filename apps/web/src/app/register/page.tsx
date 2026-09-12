import type { Metadata } from "next";

import { BrandLink } from "@/components/layout/BrandLink";
import { AuthIcon } from "@/features/auth/components/AuthIcon";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export const metadata: Metadata = { title: "Create your account | PulseTrade" };

const benefits = [
  { icon: "chart", title: "Paper Trading", text: "Practice with $10,000 virtual USD" },
  { icon: "pie", title: "Portfolio Tracking", text: "Track performance in real time" },
  { icon: "live", title: "Live Market Data", text: "Real-time prices and advanced charts" },
] as const;

export default function RegisterPage() {
  return (
    <main className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center px-4 py-8 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(3,10,22,0.65),rgba(3,10,22,0.75)),url('/images/auth-background.png')] bg-cover bg-center"
      />
      <section
        aria-labelledby="register-title"
        className="w-full max-w-[584px] rounded-xl border border-border-strong/80 bg-surface/90 p-5 shadow-panel backdrop-blur-sm sm:p-8 lg:p-10"
      >
        <div className="mb-5 flex justify-center">
          <BrandLink />
        </div>
        <h1
          id="register-title"
          className="mb-6 text-center text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Create your account
        </h1>
        <div className="mb-6 flex items-center gap-4 rounded-lg border border-positive/25 bg-positive-subtle/30 p-4">
          <span className="shrink-0 text-positive">
            <AuthIcon name="gift" className="size-8" />
          </span>
          <p className="text-sm leading-6 sm:text-base">
            New users receive <strong className="text-positive">$10,000 virtual USD</strong>
            <span className="block text-sm text-foreground-secondary">
              Practice trading with virtual funds. No real money.
            </span>
          </p>
        </div>
        <RegisterForm />
        <div className="mt-6 grid gap-4 border-t border-border-subtle pt-6 sm:grid-cols-3 sm:gap-3">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="flex gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-md border border-brand/25 bg-brand-subtle/40 text-brand">
                <AuthIcon name={benefit.icon} />
              </span>
              <div>
                <h2 className="text-xs font-semibold">{benefit.title}</h2>
                <p className="mt-1 text-xs leading-5 text-foreground-secondary">{benefit.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-foreground-muted sm:text-sm">
        <AuthIcon name="shield" />
        Paper trading only. Your real money is never at risk.
      </p>
    </main>
  );
}
