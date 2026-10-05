import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";

export function WatchlistEmptyState() {
  return (
    <EmptyState
      aria-label="Empty watchlist"
      className="rounded-none border-0 bg-transparent"
      title="Your watchlist is empty."
      description="Save markets using the star on the Markets page."
      icon={
        <svg aria-hidden="true" className="size-7 text-brand" fill="none" viewBox="0 0 24 24">
          <path
            d="M6 4h12v17l-6-4-6 4V4Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
        </svg>
      }
      action={
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-foreground-inverse shadow-brand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          href="/"
        >
          Explore Markets
        </Link>
      }
    />
  );
}
