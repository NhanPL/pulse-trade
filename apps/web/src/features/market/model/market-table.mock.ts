import type { MarketTableItem } from "./market-table";
import { SUPPORTED_MARKETS, type SupportedMarketSymbol } from "./supported-markets";

type MockMarketStats = Omit<MarketTableItem, "baseAsset" | "quoteAsset" | "symbol">;

const MOCK_STATS_BY_SYMBOL: Record<SupportedMarketSymbol, MockMarketStats> = {
  "BTC-USD": {
    price: "67542.31",
    change24hPercent: "2.41",
    high24h: "68100.00",
    low24h: "64821.00",
    volume24h: "28400000000",
  },
  "ETH-USD": {
    price: "3482.67",
    change24hPercent: "1.83",
    high24h: "3541.20",
    low24h: "3368.45",
    volume24h: "15700000000",
  },
  "SOL-USD": {
    price: "178.42",
    change24hPercent: "-0.76",
    high24h: "183.90",
    low24h: "174.08",
    volume24h: "4200000000",
  },
  "ADA-USD": {
    price: "0.4521",
    change24hPercent: "3.12",
    high24h: "0.4618",
    low24h: "0.4312",
    volume24h: "518000000",
  },
  "XRP-USD": {
    price: "0.5284",
    change24hPercent: "-1.24",
    high24h: "0.5419",
    low24h: "0.5203",
    volume24h: "1100000000",
  },
};

export const MARKET_TABLE_MOCK: readonly MarketTableItem[] = SUPPORTED_MARKETS.map((market) => ({
  ...market,
  ...MOCK_STATS_BY_SYMBOL[market.symbol],
}));
