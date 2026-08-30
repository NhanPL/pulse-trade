import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type ProviderCandle,
  type ProviderCandleEvent,
  type ProviderCandleInterval,
  type ProviderCandleUpdateEvent,
  type ProviderMarketEvent,
  type ProviderOrderBookLevel,
  type ProviderOrderBookSnapshotEvent,
  type ProviderOrderBookUpdateEvent,
  type ProviderTickerEvent,
  type ProviderTradesBatchEvent,
} from "../markets/provider/market-data-provider";

type MutableOrderBook = {
  asks: Map<string, string>;
  bids: Map<string, string>;
  marketTs: number;
  providerSequence: number;
  symbol: string;
};

@Injectable()
export class MarketCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly candles = new Map<
    string,
    Map<ProviderCandleInterval, ProviderCandleUpdateEvent>
  >();
  private readonly orderBooks = new Map<string, MutableOrderBook>();
  private readonly tickers = new Map<string, ProviderTickerEvent>();
  private readonly trades = new Map<string, ProviderTradesBatchEvent>();
  private removeProviderListener: (() => void) | undefined;

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
  ) {}

  onModuleInit(): void {
    if (this.removeProviderListener) return;
    this.removeProviderListener = this.provider.onEvent((event) => this.apply(event));
  }

  onModuleDestroy(): void {
    this.removeProviderListener?.();
    this.removeProviderListener = undefined;
  }

  apply(event: ProviderMarketEvent): void {
    switch (event.type) {
      case "ticker":
        this.applyTicker(event);
        break;
      case "candle.snapshot":
      case "candle.update":
        this.applyCandle(event);
        break;
      case "orderbook.snapshot":
        this.applyOrderBookSnapshot(event);
        break;
      case "orderbook.update":
        this.applyOrderBookUpdate(event);
        break;
      case "trades.batch":
        this.applyTrades(event);
        break;
    }
  }

  getTicker(symbol: string): ProviderTickerEvent | undefined {
    const ticker = this.tickers.get(normalizeSymbol(symbol));
    return ticker ? { ...ticker } : undefined;
  }

  getCandle(
    symbol: string,
    interval: ProviderCandleInterval,
  ): ProviderCandleUpdateEvent | undefined {
    const event = this.candles.get(normalizeSymbol(symbol))?.get(interval);
    return event ? cloneCandleEvent(event) : undefined;
  }

  getOrderBook(symbol: string): ProviderOrderBookSnapshotEvent | undefined {
    const book = this.orderBooks.get(normalizeSymbol(symbol));
    if (!book) return undefined;

    return {
      asks: sortOrderBookLevels(book.asks, "ascending"),
      bids: sortOrderBookLevels(book.bids, "descending"),
      marketTs: book.marketTs,
      providerSequence: book.providerSequence,
      symbol: book.symbol,
      type: "orderbook.snapshot",
    };
  }

  getTrades(symbol: string): ProviderTradesBatchEvent | undefined {
    const event = this.trades.get(normalizeSymbol(symbol));
    return event ? cloneTradesEvent(event) : undefined;
  }

  private applyTicker(event: ProviderTickerEvent): void {
    const cached = this.tickers.get(event.symbol);
    if (cached && !isNewerEvent(event, cached)) return;
    this.tickers.set(event.symbol, { ...event });
  }

  private applyCandle(event: ProviderCandleEvent): void {
    const candle = event.type === "candle.update" ? event.candle : findLatestCandle(event.candles);
    if (!candle) return;

    const candidate: ProviderCandleUpdateEvent = {
      candle: { ...candle },
      interval: event.interval,
      marketTs: event.marketTs,
      providerSequence: event.providerSequence,
      symbol: event.symbol,
      type: "candle.update",
    };
    const candlesByInterval = this.candles.get(event.symbol) ?? new Map();
    const cached = candlesByInterval.get(event.interval);

    if (cached && !isNewerCandle(candidate, cached)) return;

    candlesByInterval.set(event.interval, candidate);
    this.candles.set(event.symbol, candlesByInterval);
  }

  private applyOrderBookSnapshot(event: ProviderOrderBookSnapshotEvent): void {
    this.orderBooks.set(event.symbol, {
      asks: new Map(event.asks),
      bids: new Map(event.bids),
      marketTs: event.marketTs,
      providerSequence: event.providerSequence,
      symbol: event.symbol,
    });
  }

  private applyOrderBookUpdate(event: ProviderOrderBookUpdateEvent): void {
    const book = this.orderBooks.get(event.symbol);
    // Provider sequence also advances for sibling channels, so gaps are not level2 gaps here.
    if (!book || event.providerSequence <= book.providerSequence) return;

    for (const change of event.changes) {
      const levels = change.side === "BID" ? book.bids : book.asks;
      if (isZeroDecimal(change.quantity)) levels.delete(change.price);
      else levels.set(change.price, change.quantity);
    }

    book.marketTs = Math.max(book.marketTs, event.marketTs);
    book.providerSequence = event.providerSequence;
  }

  private applyTrades(event: ProviderTradesBatchEvent): void {
    const cached = this.trades.get(event.symbol);
    if (cached && !isNewerEvent(event, cached)) return;
    this.trades.set(event.symbol, cloneTradesEvent(event));
  }
}

function cloneCandleEvent(event: ProviderCandleUpdateEvent): ProviderCandleUpdateEvent {
  return { ...event, candle: { ...event.candle } };
}

function cloneTradesEvent(event: ProviderTradesBatchEvent): ProviderTradesBatchEvent {
  return { ...event, trades: event.trades.map((trade) => ({ ...trade })) };
}

function findLatestCandle(candles: readonly ProviderCandle[]): ProviderCandle | undefined {
  let latest: ProviderCandle | undefined;

  for (const candle of candles) {
    if (!latest || candle.time > latest.time) latest = candle;
  }

  return latest;
}

function isNewerCandle(
  candidate: ProviderCandleUpdateEvent,
  cached: ProviderCandleUpdateEvent,
): boolean {
  if (candidate.candle.time !== cached.candle.time) {
    return candidate.candle.time > cached.candle.time;
  }

  return isNewerEvent(candidate, cached);
}

function isNewerEvent(
  candidate: Readonly<{ marketTs: number; providerSequence: number }>,
  cached: Readonly<{ marketTs: number; providerSequence: number }>,
): boolean {
  if (candidate.marketTs !== cached.marketTs) return candidate.marketTs > cached.marketTs;
  return candidate.providerSequence > cached.providerSequence;
}

function sortOrderBookLevels(
  levels: ReadonlyMap<string, string>,
  direction: "ascending" | "descending",
): readonly ProviderOrderBookLevel[] {
  return [...levels]
    .sort(([leftPrice], [rightPrice]) => {
      const comparison = compareUnsignedDecimals(leftPrice, rightPrice);
      return direction === "ascending" ? comparison : -comparison;
    })
    .map(([price, quantity]) => [price, quantity] as const);
}

function compareUnsignedDecimals(left: string, right: string): number {
  const [leftInteger = "0", leftFraction = ""] = left.split(".");
  const [rightInteger = "0", rightFraction = ""] = right.split(".");

  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length < rightInteger.length ? -1 : 1;
  }

  if (leftInteger !== rightInteger) return leftInteger < rightInteger ? -1 : 1;

  const fractionLength = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeftFraction = leftFraction.padEnd(fractionLength, "0");
  const normalizedRightFraction = rightFraction.padEnd(fractionLength, "0");

  if (normalizedLeftFraction === normalizedRightFraction) return 0;
  return normalizedLeftFraction < normalizedRightFraction ? -1 : 1;
}

function isZeroDecimal(value: string): boolean {
  return /^0(?:\.0+)?$/.test(value);
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
