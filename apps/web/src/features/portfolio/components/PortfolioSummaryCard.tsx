import { classNames } from "@/components/ui/class-names";
import { memo } from "react";

import { presentSummaryValue } from "../model/portfolio-summary";

type SummaryIcon = "wallet" | "trend" | "bars" | "cash";

type PortfolioSummaryCardProps = {
  amount: string | null;
  description: string;
  icon: SummaryIcon;
  highlightNote?: boolean;
  isPnl?: boolean;
  label: string;
  note: string;
};

const iconPaths: Record<SummaryIcon, string> = {
  wallet:
    "M19 7V5a1 1 0 0 0-1-1L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5m16 5h-5a2 2 0 0 0 0 4h5m-5-2h.01",
  trend: "m3 17 6-6 4 4 8-10m-7 0h7v7",
  bars: "M5 14v6m7-16v16m7-11v11",
  cash: "M15 8.5c0-1.4-1.3-2.5-3-2.5S9 7.1 9 8.5 10.3 11 12 11s3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5M12 4v14",
};

export const PortfolioSummaryCard = memo(function PortfolioSummaryCard({
  amount,
  description,
  icon,
  highlightNote = false,
  isPnl = false,
  label,
  note,
}: PortfolioSummaryCardProps) {
  const { text, tone } = presentSummaryValue(amount, isPnl);

  return (
    <div className="relative min-h-36 min-w-0 rounded-lg border border-border bg-surface-elevated/80 p-5 pl-24 shadow-panel sm:pl-26">
      <dt className="flex items-center gap-2 text-sm text-foreground-secondary">
        <span
          aria-hidden="true"
          className={classNames(
            "absolute left-5 top-6 grid size-14 place-items-center rounded-full sm:size-16",
            icon === "cash" ? "bg-info-subtle/60 text-info" : "bg-brand-subtle/65 text-brand",
          )}
        >
          <svg
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={icon === "bars" ? 4 : 1.75}
            viewBox="0 0 24 24"
          >
            {icon === "cash" ? <circle cx="12" cy="12" r="10" /> : null}
            <path d={iconPaths[icon]} />
          </svg>
        </span>
        {label}
        <details className="group relative shrink-0">
          <summary
            aria-label={`About ${label}`}
            className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full text-foreground-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden"
          >
            <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 11v6m0-10v1" stroke="currentColor" strokeWidth="1.75" />
            </svg>
          </summary>
          <p className="absolute right-0 top-9 z-20 w-52 rounded-lg border border-border-strong bg-surface-overlay p-3 text-xs leading-5 text-foreground-secondary shadow-overlay">
            {description}
          </p>
        </details>
      </dt>
      <dd
        className={classNames(
          "mt-1 break-words text-2xl font-semibold tabular-nums tracking-tight",
          tone === "positive"
            ? "text-positive"
            : tone === "negative"
              ? "text-negative"
              : "text-foreground",
        )}
      >
        {text === "—" ? <span aria-label="Not available">{text}</span> : text}
      </dd>
      <dd
        className={classNames(
          "mt-2 text-xs text-foreground-muted",
          highlightNote && tone === "positive" && "text-positive",
          highlightNote && tone === "negative" && "text-negative",
        )}
      >
        {text === "—" ? "Not available" : note}
      </dd>
    </div>
  );
});
