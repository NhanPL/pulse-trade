import {
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle } from "@pulse-trade/contracts";

type CandlestickChart = Pick<IChartApi, "timeScale">;
type CandlestickSeries = Pick<ISeriesApi<"Candlestick", Time>, "setData" | "update">;

/** Imperative boundary between normalized candles and Lightweight Charts. */
export function syncHistoricalCandles(
  chart: CandlestickChart,
  series: CandlestickSeries,
  candles: readonly Candle[],
): number {
  series.setData(candles.map(toChartCandle));
  chart.timeScale().fitContent();

  return candles.reduce((latestTime, candle) => Math.max(latestTime, candle.time), 0);
}

export function applyCurrentCandle(
  series: CandlestickSeries,
  candle: Candle,
  latestHistoricalCandleTime: number | undefined,
): boolean {
  if (latestHistoricalCandleTime !== undefined && candle.time < latestHistoricalCandleTime) {
    return false;
  }

  series.update(toChartCandle(candle));
  return true;
}

export function toChartCandle(candle: Candle): CandlestickData<UTCTimestamp> {
  return {
    close: Number(candle.close),
    high: Number(candle.high),
    low: Number(candle.low),
    open: Number(candle.open),
    // Candle schema validates Unix seconds; Lightweight Charts brands this runtime number as UTCTimestamp.
    time: candle.time as UTCTimestamp,
  };
}
