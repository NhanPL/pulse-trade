import { memo } from "react";

import { classNames } from "@/components/ui/class-names";
import { formatMarketPrice } from "@/lib/format/market-value";

import type { OrderBookPreviewLevel, OrderBookSide } from "./order-book-preview";

const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

export type OrderBookLevelRowProps = {
  level: OrderBookPreviewLevel;
  side: OrderBookSide;
};

// Individual rows remain isolated when the realtime order-book presentation model replaces the preview.
export const OrderBookLevelRow = memo(function OrderBookLevelRow({
  level,
  side,
}: OrderBookLevelRowProps) {
  const depthColor =
    side === "ask" ? "var(--pt-color-negative-subtle)" : "var(--pt-color-positive-subtle)";

  return (
    <tr
      className="h-8 transition-colors hover:bg-surface-hover/60 lg:h-6"
      style={{
        backgroundImage: `linear-gradient(${depthColor}, ${depthColor})`,
        backgroundPosition: "right",
        backgroundRepeat: "no-repeat",
        backgroundSize: `${level.depthPercent}% 100%`,
      }}
    >
      <td
        className={classNames(
          "px-4 text-left font-mono text-xs font-medium tabular-nums",
          side === "ask" ? "text-negative" : "text-positive",
        )}
      >
        {formatMarketPrice(level.price)}
      </td>
      <td className="px-3 text-right font-mono text-xs tabular-nums text-foreground-secondary">
        {quantityFormatter.format(Number(level.amount))}
      </td>
      <td className="px-4 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {formatMarketPrice(level.total)}
      </td>
    </tr>
  );
});
