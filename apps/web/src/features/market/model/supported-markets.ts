export type MarketConfiguration = {
  baseAsset: string;
  quoteAsset: string;
  symbol: string;
};

export const SUPPORTED_MARKETS = [
  { symbol: "BTC-USD", baseAsset: "BTC", quoteAsset: "USD" },
  { symbol: "ETH-USD", baseAsset: "ETH", quoteAsset: "USD" },
  { symbol: "SOL-USD", baseAsset: "SOL", quoteAsset: "USD" },
  { symbol: "ADA-USD", baseAsset: "ADA", quoteAsset: "USD" },
  { symbol: "XRP-USD", baseAsset: "XRP", quoteAsset: "USD" },
] as const satisfies readonly MarketConfiguration[];

export type SupportedMarket = (typeof SUPPORTED_MARKETS)[number];
export type SupportedMarketSymbol = SupportedMarket["symbol"];

export const SUPPORTED_MARKET_SYMBOLS: readonly SupportedMarketSymbol[] = SUPPORTED_MARKETS.map(
  ({ symbol }) => symbol,
);

const supportedMarketSymbolSet = new Set<string>(SUPPORTED_MARKET_SYMBOLS);

export function isSupportedMarketSymbol(symbol: string): symbol is SupportedMarketSymbol {
  return supportedMarketSymbolSet.has(symbol);
}

export function getSupportedMarket(symbol: string): SupportedMarket | undefined {
  return SUPPORTED_MARKETS.find((market) => market.symbol === symbol);
}
