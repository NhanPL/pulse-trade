import { classNames } from "@/components/ui/class-names";

import { presentCashBalance, type CashBalance } from "../model/cash-balance";

type BalanceMetricProps = {
  label: string;
  description: string;
  amount: string | undefined;
  percent?: number;
  highlight?: boolean;
};

function BalanceMetric({ label, description, amount, percent, highlight }: BalanceMetricProps) {
  return (
    <div className="min-w-0 py-4 first:pt-0 last:pb-0 sm:px-5 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <dt className="relative flex items-center gap-2 text-sm text-foreground-secondary">
        {label}
        <details>
          <summary
            aria-label={`About ${label}`}
            className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full text-foreground-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden"
          >
            <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 11v6m0-10v1" stroke="currentColor" strokeWidth="1.75" />
            </svg>
          </summary>
          <p className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-border-strong bg-surface-overlay p-3 text-xs leading-5 text-foreground-secondary shadow-overlay">
            {description}
          </p>
        </details>
      </dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
        <span className="min-w-0 break-words text-xl text-foreground">
          {amount ?? <span aria-label="Not available">—</span>}
        </span>
        {percent !== undefined ? (
          <span
            className={classNames(
              "text-sm",
              highlight && percent > 0 ? "text-positive" : "text-foreground-muted",
            )}
          >
            ({percent.toFixed(2)}%)
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export function BalancePanel({ cash }: { cash: CashBalance | null }) {
  const balance = presentCashBalance(cash);
  const percent = balance?.availablePercent ?? 0;
  const ringValue = balance?.hasCash ? `${percent}%` : "—";
  const ringNote = balance === null ? "Unavailable" : balance.hasCash ? "Available" : "No cash";
  const ringDescription =
    balance === null
      ? "Cash balance unavailable"
      : balance.hasCash
        ? `${percent}% of virtual USD cash available`
        : "No virtual USD cash";

  return (
    <section
      aria-label="Cash balances"
      className="rounded-lg border border-border bg-surface-elevated/80 p-3 shadow-panel"
    >
      <h2 className="mb-2 flex items-center gap-3 px-2 py-1.5 text-base font-semibold text-foreground">
        <svg
          aria-hidden="true"
          className="size-6 text-foreground-secondary"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path d="M3 8V5h18v3M3 16v3h18v-3M2 11v3h3m17-3v3h-3" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 9v6" />
        </svg>
        <span>
          Balances <span className="font-normal text-foreground-secondary">(USD)</span>
        </span>
      </h2>

      <div className="grid items-center gap-5 rounded-lg border border-border-subtle bg-surface/35 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_8rem] lg:py-3">
        <dl className="grid min-w-0 divide-y divide-border-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <BalanceMetric
            amount={balance?.available}
            description="Virtual USD you can use for new paper orders. Funds reserved for open orders are excluded."
            highlight
            label="USD Available"
            percent={balance?.availablePercent}
          />
          <BalanceMetric
            amount={balance?.locked}
            description="Virtual USD reserved for pending orders. It cannot fund another order until released."
            label="USD Locked"
            percent={balance?.lockedPercent}
          />
          <BalanceMetric
            amount={balance?.total}
            description="Available plus locked virtual USD. Crypto holdings are not included in this cash total."
            label="Total (USD)"
          />
        </dl>

        <figure
          aria-label={ringDescription}
          className="relative mx-auto grid size-20 place-items-center"
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 size-full -rotate-90"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="9"
              className="text-border"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              pathLength="100"
              stroke="currentColor"
              strokeWidth="9"
              strokeDasharray={`${percent} ${100 - percent}`}
              className="text-brand"
            />
          </svg>
          <figcaption className="text-center">
            <span className="block text-sm font-semibold tabular-nums text-foreground">
              {ringValue}
            </span>
            <span className="block text-[10px] text-foreground-secondary">{ringNote}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
