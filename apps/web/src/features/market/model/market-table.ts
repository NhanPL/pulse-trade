import type { SupportedMarketSymbol } from "./supported-markets";

export type MarketTableItem = {
  baseAsset: string;
  change24hPercent: string;
  high24h: string;
  low24h: string;
  price: string;
  quoteAsset: string;
  symbol: SupportedMarketSymbol;
  volume24h: string;
};
