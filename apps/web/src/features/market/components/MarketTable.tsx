import type { MarketTableItem } from "../model/market-table";
import { MarketRow } from "./MarketRow";

export type MarketTableProps = {
  markets: readonly MarketTableItem[];
};

export function MarketTable({ markets }: MarketTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-left">
        <caption className="sr-only">
          Supported crypto markets with static price and 24-hour statistics
        </caption>
        <thead>
          <tr className="border-b border-border-subtle bg-surface/75 text-xs uppercase tracking-wide text-foreground-muted">
            <th className="px-5 py-3.5 font-medium" scope="col">
              Market
            </th>
            <th className="px-4 py-3.5 text-right font-medium" scope="col">
              Price
            </th>
            <th className="px-4 py-3.5 text-right font-medium" scope="col">
              24h change
            </th>
            <th className="px-4 py-3.5 text-right font-medium" scope="col">
              24h high
            </th>
            <th className="px-4 py-3.5 text-right font-medium" scope="col">
              24h low
            </th>
            <th className="px-4 py-3.5 text-right font-medium" scope="col">
              24h volume
            </th>
            <th className="px-5 py-3.5 text-center font-medium" scope="col">
              Watch
            </th>
          </tr>
        </thead>
        <tbody>
          {markets.map((market) => (
            <MarketRow key={market.symbol} market={market} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
