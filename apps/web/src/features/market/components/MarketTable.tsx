import type { MarketTableItem } from "../model/market-table";
import { MarketRow } from "./MarketRow";

export type MarketTableProps = {
  markets: readonly MarketTableItem[];
};

export function MarketTable({ markets }: MarketTableProps) {
  return (
    <div className="md:overflow-x-auto">
      <table className="block w-full border-collapse text-left md:table md:min-w-[920px]">
        <caption className="sr-only">
          Supported crypto markets with static price and 24-hour statistics
        </caption>
        <thead className="hidden md:table-header-group">
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
        <tbody className="grid gap-3 bg-canvas/20 p-3 sm:p-4 md:table-row-group md:bg-transparent md:p-0">
          {markets.map((market) => (
            <MarketRow key={market.symbol} market={market} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
