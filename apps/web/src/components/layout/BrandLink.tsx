import Link from "next/link";

export function BrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      aria-label="PulseTrade markets"
      className="flex shrink-0 items-center gap-2 rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      href="/"
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-brand-subtle text-brand shadow-brand"
      >
        <svg fill="none" viewBox="0 0 24 24" className="size-5">
          <path
            d="M3 13h4l2.25-6 4.25 11L16 11h5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </span>
      <span
        className={
          compact ? "text-base font-bold tracking-tight" : "text-lg font-bold tracking-tight"
        }
      >
        Pulse<span className="text-brand">Trade</span>
      </span>
    </Link>
  );
}
