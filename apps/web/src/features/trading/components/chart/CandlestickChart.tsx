"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef } from "react";

import type { Candle, CandleInterval } from "@pulse-trade/contracts";

import { useHistoricalCandles } from "../../hooks/useHistoricalCandles";
import { candleStore, selectCurrentCandle } from "../../../realtime/stores/candle-store";
import { ChartDataState } from "./ChartDataState";
import { resolveChartDataState } from "./chart-data-state";
import { observeChartSize } from "./chart-resize";

export type CandlestickChartProps = Readonly<{
  symbol: string;
  timeframe: CandleInterval;
}>;

export function CandlestickChart({ symbol, timeframe }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const latestHistoricalCandleTimeRef = useRef<number | undefined>(undefined);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const historicalCandles = useHistoricalCandles(symbol, timeframe);
  const chartDataState = resolveChartDataState({
    candleCount: historicalCandles.data?.candles.length,
    isError: historicalCandles.isError,
    isPending: historicalCandles.isPending,
  });

  const updateCurrentCandle = useCallback((candle: Candle): void => {
    if (
      latestHistoricalCandleTimeRef.current !== undefined &&
      candle.time < latestHistoricalCandleTimeRef.current
    ) {
      return;
    }

    seriesRef.current?.update(toChartCandle(candle));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { height, width } = container.getBoundingClientRect();
    const chart = createChart(container, {
      autoSize: false,
      crosshair: {
        mode: CrosshairMode.Normal,
        horzLine: { color: "#26384b", labelBackgroundColor: "#102033" },
        vertLine: { color: "#26384b", labelBackgroundColor: "#102033" },
      },
      grid: {
        horzLines: { color: "rgba(82, 112, 138, 0.16)" },
        vertLines: { color: "rgba(82, 112, 138, 0.16)" },
      },
      handleScale: true,
      handleScroll: true,
      height: Math.max(1, Math.round(height)),
      layout: {
        attributionLogo: false,
        background: { color: "#0c1a2b", type: ColorType.Solid },
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        textColor: "#8492a7",
      },
      rightPriceScale: { borderColor: "#26384b" },
      timeScale: {
        borderColor: "#26384b",
        secondsVisible: false,
        timeVisible: true,
      },
      width: Math.max(1, Math.round(width)),
    });
    const series = chart.addSeries(CandlestickSeries, {
      borderDownColor: "#ff5261",
      borderUpColor: "#2bd99f",
      downColor: "#ff5261",
      upColor: "#2bd99f",
      wickDownColor: "#ff5261",
      wickUpColor: "#2bd99f",
    });

    chartRef.current = chart;
    seriesRef.current = series;
    const stopObservingSize = observeChartSize(chart, container);

    return () => {
      stopObservingSize();
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    latestHistoricalCandleTimeRef.current = undefined;
    seriesRef.current?.setData([]);
  }, [symbol, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !historicalCandles.data) return;

    const candles = historicalCandles.data.candles;
    latestHistoricalCandleTimeRef.current = candles.reduce(
      (latestTime, candle) => Math.max(latestTime, candle.time),
      0,
    );
    series.setData(candles.map(toChartCandle));
    chart.timeScale().fitContent();

    const currentCandle = selectCurrentCandle(symbol, timeframe)(candleStore.getState());
    if (currentCandle) updateCurrentCandle(currentCandle.candle);
  }, [historicalCandles.data, symbol, timeframe, updateCurrentCandle]);

  useEffect(() => {
    const selectCandle = selectCurrentCandle(symbol, timeframe);
    const currentCandle = selectCandle(candleStore.getState());
    if (currentCandle) updateCurrentCandle(currentCandle.candle);

    return candleStore.subscribe((state, previousState) => {
      const nextCandle = selectCandle(state);
      const previousCandle = selectCandle(previousState);
      if (nextCandle === previousCandle) return;

      if (nextCandle) updateCurrentCandle(nextCandle.candle);
    });
  }, [symbol, timeframe, updateCurrentCandle]);

  return (
    <>
      <div
        aria-label={`${symbol} candlestick chart`}
        className="absolute inset-0"
        ref={containerRef}
        role="img"
      />
      {chartDataState !== "ready" ? (
        <ChartDataState
          isRetrying={historicalCandles.isFetching}
          onRetry={() => {
            void historicalCandles.refetch();
          }}
          status={chartDataState}
          symbol={symbol}
        />
      ) : null}
    </>
  );
}

function toChartCandle(candle: Candle): CandlestickData<UTCTimestamp> {
  return {
    close: Number(candle.close),
    high: Number(candle.high),
    low: Number(candle.low),
    open: Number(candle.open),
    // Candle schema validates Unix seconds; Lightweight Charts brands this runtime number as UTCTimestamp.
    time: candle.time as UTCTimestamp,
  };
}
