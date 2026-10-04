"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { classNames } from "@/components/ui/class-names";
import { useAuthSession } from "@/features/auth/components/AuthSessionProvider";
import { useWatchlistToggle } from "../hooks/useWatchlistToggle";

function Star({ saved }: { saved: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={classNames("size-5", saved && "text-brand")}
      fill={saved ? "currentColor" : "none"}
      viewBox="0 0 24 24"
    >
      <path
        d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function WatchlistToggle({ symbol }: { symbol: string }) {
  const session = useAuthSession();
  const toggle = useWatchlistToggle(symbol);
  const label = toggle.saved ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`;
  const style = "size-10 md:size-9";
  if (session.status === "unauthenticated") {
    return (
      <Link
        aria-label={`Sign in to add ${symbol} to watchlist`}
        className={classNames(
          "inline-grid place-items-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-selected hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          style,
        )}
        href="/login?returnTo=%2F"
        onClick={(event) => event.stopPropagation()}
        title="Sign in to add to watchlist"
      >
        <Star saved={false} />
      </Link>
    );
  }
  return (
    <Button
      aria-label={label}
      aria-pressed={toggle.saved}
      className={classNames(
        style,
        toggle.saved ? "text-brand hover:text-brand" : "text-foreground-muted",
      )}
      disabled={toggle.disabled}
      isLoading={toggle.pending}
      onClick={(event) => {
        event.stopPropagation();
        toggle.toggle();
      }}
      size="icon"
      title={label}
      variant="ghost"
    >
      {!toggle.pending ? <Star saved={toggle.saved} /> : null}
    </Button>
  );
}
