export const SUPPORTED_MARKET_SYMBOLS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "ADA-USD",
  "XRP-USD",
] as const;

export type SupportedMarketSymbol = (typeof SUPPORTED_MARKET_SYMBOLS)[number];

const supportedMarketSymbols = new Set<string>(SUPPORTED_MARKET_SYMBOLS);

export function isSupportedMarketSymbol(symbol: string): symbol is SupportedMarketSymbol {
  return supportedMarketSymbols.has(symbol);
}
