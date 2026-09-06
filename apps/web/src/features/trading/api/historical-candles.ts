import {
  historicalCandlesResponseSchema,
  type CandleInterval,
  type HistoricalCandlesResponse,
} from "@pulse-trade/contracts";

import { webEnvironment } from "../../../lib/env/server";

export const HISTORICAL_CANDLE_LIMIT = 300;

export type HistoricalCandlesRequest = Readonly<{
  interval: CandleInterval;
  limit?: number;
  signal?: AbortSignal;
  symbol: string;
}>;

export async function fetchHistoricalCandles({
  interval,
  limit = HISTORICAL_CANDLE_LIMIT,
  signal,
  symbol,
}: HistoricalCandlesRequest): Promise<HistoricalCandlesResponse["data"]> {
  const url = new URL(
    `markets/${encodeURIComponent(symbol)}/candles`,
    `${webEnvironment.NEXT_PUBLIC_API_URL}/`,
  );
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Unable to load historical candles (${response.status})`);
  }

  return historicalCandlesResponseSchema.parse(await response.json()).data;
}
