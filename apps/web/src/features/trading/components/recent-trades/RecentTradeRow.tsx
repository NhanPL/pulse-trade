import { memo } from "react";

import { classNames } from "@/components/ui/class-names";
import { formatMarketPrice } from "@/lib/format/market-value";

import type { RecentTradePreview } from "./recent-trades-preview";

const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

export type RecentTradeRowProps = {
  trade: RecentTradePreview;
};

// A normalized trade only updates its own row when the bounded realtime buffer replaces this preview.
export const RecentTradeRow = memo(function RecentTradeRow({ trade }: RecentTradeRowProps) {
  const isBuy = trade.side === "BUY";

  return (
    <tr className="h-10 border-b border-border-subtle last:border-b-0 hover:bg-surface-hover/60 lg:h-7">
      <td
        className={classNames(
          "px-4 font-mono text-xs font-medium tabular-nums",
          isBuy ? "text-positive" : "text-negative",
        )}
      >
        {formatMarketPrice(trade.price)}
      </td>
      <td className="px-3 text-right font-mono text-xs tabular-nums text-foreground-secondary">
        {quantityFormatter.format(Number(trade.quantity))}
      </td>
      <td className="px-3 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {timeFormatter.format(new Date(trade.marketTs))}
      </td>
      <td className="px-4 text-right">
        <span
          className={classNames(
            "inline-flex min-w-11 justify-center rounded-md px-2 py-1 text-[0.6875rem] font-semibold",
            isBuy ? "bg-positive-subtle text-positive" : "bg-negative-subtle text-negative",
          )}
        >
          {trade.side}
        </span>
      </td>
    </tr>
  );
});
