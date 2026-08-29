import { Badge } from "@/components/ui/Badge";
import { classNames } from "@/components/ui/class-names";
import {
  formatMarketPrice,
  formatMarketVolume,
  formatPercentChange,
} from "@/lib/format/market-value";

import { TradingHeaderPrice } from "./TradingHeaderPrice";

export type TradingMarketHeaderProps = {
  baseAsset: string;
  change24hPercent: string;
  high24h: string;
  low24h: string;
  price: string;
  quoteAsset: string;
  symbol: string;
  volume24h: string;
};

export function TradingMarketHeader(props: TradingMarketHeaderProps) {
  const isPositive = Number(props.change24hPercent) >= 0;

  return (
    <section
      aria-labelledby="trading-market-title"
      className="rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(14rem,0.9fr)_minmax(16rem,1.1fr)_minmax(22rem,1.4fr)_auto] lg:items-center lg:gap-7 lg:px-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-brand/25 bg-brand-subtle text-sm font-bold text-brand"
          >
            {props.baseAsset.slice(0, 1)}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              Trading workspace
            </p>
            <h1 id="trading-market-title" className="mt-1 text-xl font-bold text-foreground">
              {props.baseAsset}
              <span className="font-normal text-foreground-muted">/{props.quoteAsset}</span>
            </h1>
            <p className="mt-0.5 font-mono text-xs text-foreground-muted">{props.symbol}</p>
          </div>
        </div>

        <div className="border-t border-border-subtle pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <p className="mb-1 text-xs text-foreground-muted">Current price</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <TradingHeaderPrice price={props.price} symbol={props.symbol} />
            <span
              className={classNames(
                "font-mono text-sm font-semibold tabular-nums",
                isPositive ? "text-positive" : "text-negative",
              )}
            >
              {formatPercentChange(props.change24hPercent)}
              <span className="ml-1 font-sans text-xs font-normal text-foreground-muted">24h</span>
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3 border-t border-border-subtle pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <div>
            <dt className="text-xs text-foreground-muted">24h high</dt>
            <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground-secondary">
              {formatMarketPrice(props.high24h)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">24h low</dt>
            <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground-secondary">
              {formatMarketPrice(props.low24h)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">24h volume</dt>
            <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground-secondary">
              {formatMarketVolume(props.volume24h)}
            </dd>
          </div>
        </dl>

        <Badge aria-label="Market data status: Delayed" showDot variant="warning">
          Delayed
        </Badge>
      </div>
    </section>
  );
}
