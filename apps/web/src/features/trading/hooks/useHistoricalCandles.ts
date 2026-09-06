import { useQuery } from "@tanstack/react-query";
import type { CandleInterval } from "@pulse-trade/contracts";

import { fetchHistoricalCandles, HISTORICAL_CANDLE_LIMIT } from "../api/historical-candles";

export function historicalCandlesQueryKey(symbol: string, interval: CandleInterval) {
  return ["markets", symbol, "candles", interval, HISTORICAL_CANDLE_LIMIT] as const;
}

export function useHistoricalCandles(symbol: string, interval: CandleInterval) {
  return useQuery({
    queryFn: ({ signal }) => fetchHistoricalCandles({ interval, signal, symbol }),
    queryKey: historicalCandlesQueryKey(symbol, interval),
    staleTime: 30_000,
  });
}
