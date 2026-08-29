import type { MarketTableItem } from "../model/market-table";

export function filterMarkets(
  markets: readonly MarketTableItem[],
  searchTerm: string,
): readonly MarketTableItem[] {
  const query = searchTerm.trim().toUpperCase();

  if (!query) return markets;

  return markets.filter(
    (market) =>
      market.symbol.toUpperCase().includes(query) || market.baseAsset.toUpperCase().includes(query),
  );
}
