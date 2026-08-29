import { Badge } from "@/components/ui/Badge";

import { RecentTradeRow } from "./RecentTradeRow";
import { createRecentTradesPreview } from "./recent-trades-preview";

export type RecentTradesProps = {
  baseAsset: string;
  midPrice: string;
  quoteAsset: string;
  symbol: string;
};

export function RecentTrades({ baseAsset, midPrice, quoteAsset, symbol }: RecentTradesProps) {
  const trades = createRecentTradesPreview(midPrice);

  return (
    <section
      aria-labelledby="recent-trades-title"
      className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
    >
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5">
        <div>
          <h2 id="recent-trades-title" className="text-sm font-semibold text-foreground">
            Recent trades
          </h2>
          <p className="mt-0.5 font-mono text-xs text-foreground-muted">{symbol}</p>
        </div>
        <Badge variant="neutral">Snapshot</Badge>
      </header>

      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[28rem] table-fixed border-collapse">
          <caption className="sr-only">
            Static {symbol} recent trades preview, newest first; times shown in UTC
          </caption>
          <thead className="sticky top-0 z-10 bg-surface-elevated">
            <tr className="h-9 border-b border-border-subtle text-xs text-foreground-muted">
              <th className="px-4 text-left font-medium" scope="col">
                Price ({quoteAsset})
              </th>
              <th className="px-3 text-right font-medium" scope="col">
                Quantity ({baseAsset})
              </th>
              <th className="px-3 text-right font-medium" scope="col">
                Time (UTC)
              </th>
              <th className="px-4 text-right font-medium" scope="col">
                Side
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <RecentTradeRow key={trade.id} trade={trade} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
