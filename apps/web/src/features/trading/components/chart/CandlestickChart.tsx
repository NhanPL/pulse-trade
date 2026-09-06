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
import { useEffect, useRef } from "react";

import type { Candle, CandleInterval } from "@pulse-trade/contracts";

import { useHistoricalCandles } from "../../hooks/useHistoricalCandles";

export type CandlestickChartProps = Readonly<{
  symbol: string;
  timeframe: CandleInterval;
}>;

export function CandlestickChart({ symbol, timeframe }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const historicalCandles = useHistoricalCandles(symbol, timeframe);

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

    return () => {
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.setData([]);
  }, [symbol, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !historicalCandles.data) return;

    series.setData(historicalCandles.data.candles.map(toChartCandle));
    chart.timeScale().fitContent();
  }, [historicalCandles.data]);

  return (
    <div
      aria-label={`${symbol} candlestick chart`}
      className="absolute inset-0"
      ref={containerRef}
      role="img"
    />
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
