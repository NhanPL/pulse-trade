import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/layout/PageContainer";
import { WatchlistDashboard } from "@/features/watchlist/components/WatchlistDashboard";

export const metadata: Metadata = { title: "Watchlist | PulseTrade" };
export const dynamic = "force-dynamic";

export default function WatchlistPage() {
  return (
    <PageContainer className="max-w-[1586px] space-y-8" width="full">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Watchlist</h1>
          <p className="mt-2 text-base text-foreground-secondary">Your saved markets</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand/35 bg-surface px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          href="/"
        >
          <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
          Explore Markets
        </Link>
      </header>
      <WatchlistDashboard />
    </PageContainer>
  );
}
