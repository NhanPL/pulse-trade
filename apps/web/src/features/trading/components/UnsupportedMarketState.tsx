import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";

export type UnsupportedMarketStateProps = {
  symbol: string;
};

function MarketUnavailableIcon() {
  return (
    <svg aria-hidden="true" className="size-7" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 7.5h14M7.5 4v3.5m9-3.5v3.5M6 20h12a2 2 0 0 0 2-2V7.5H4V18a2 2 0 0 0 2 2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <path d="m9 12 6 4m0-4-6 4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export function UnsupportedMarketState({ symbol }: UnsupportedMarketStateProps) {
  return (
    <EmptyState
      action={
        <Link
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-foreground-inverse shadow-brand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          href="/"
        >
          Explore markets
        </Link>
      }
      description={
        <>
          <span className="font-mono text-foreground-secondary">{symbol}</span> is not in the
          supported PulseTrade market list.
        </>
      }
      icon={<MarketUnavailableIcon />}
      title="Unsupported market"
    />
  );
}
