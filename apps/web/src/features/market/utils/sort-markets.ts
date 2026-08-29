import type { MarketTableItem } from "../model/market-table";

export const MARKET_SORT_OPTIONS = [
  { value: "symbol-asc", label: "Symbol A–Z" },
  { value: "symbol-desc", label: "Symbol Z–A" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "change-desc", label: "24h change: high to low" },
  { value: "change-asc", label: "24h change: low to high" },
  { value: "volume-desc", label: "Volume: high to low" },
  { value: "volume-asc", label: "Volume: low to high" },
] as const;

export type MarketSortOption = (typeof MARKET_SORT_OPTIONS)[number]["value"];

const marketSortOptionSet = new Set<string>(MARKET_SORT_OPTIONS.map(({ value }) => value));

export function isMarketSortOption(value: string): value is MarketSortOption {
  return marketSortOptionSet.has(value);
}

export function sortMarkets(
  markets: readonly MarketTableItem[],
  sortOption: MarketSortOption,
): readonly MarketTableItem[] {
  const sortedMarkets = [...markets];

  switch (sortOption) {
    case "symbol-asc":
      return sortedMarkets.sort((left, right) => left.symbol.localeCompare(right.symbol));
    case "symbol-desc":
      return sortedMarkets.sort((left, right) => right.symbol.localeCompare(left.symbol));
    case "price-asc":
      return sortedMarkets.sort((left, right) => Number(left.price) - Number(right.price));
    case "price-desc":
      return sortedMarkets.sort((left, right) => Number(right.price) - Number(left.price));
    case "change-asc":
      return sortedMarkets.sort(
        (left, right) => Number(left.change24hPercent) - Number(right.change24hPercent),
      );
    case "change-desc":
      return sortedMarkets.sort(
        (left, right) => Number(right.change24hPercent) - Number(left.change24hPercent),
      );
    case "volume-asc":
      return sortedMarkets.sort((left, right) => Number(left.volume24h) - Number(right.volume24h));
    case "volume-desc":
      return sortedMarkets.sort((left, right) => Number(right.volume24h) - Number(left.volume24h));
  }
}
