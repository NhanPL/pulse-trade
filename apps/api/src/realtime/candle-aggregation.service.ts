import { Injectable } from "@nestjs/common";

import type {
  ProviderCandle,
  ProviderCandleInterval,
  ProviderCandleUpdateEvent,
  ProviderMarketEvent,
  ProviderTrade,
  ProviderTradesBatchEvent,
} from "../markets/provider/market-data-provider";

const CANDLE_INTERVALS: readonly ProviderCandleInterval[] = ["1m", "5m", "15m", "1h"];
const SECONDS_BY_INTERVAL: Readonly<Record<ProviderCandleInterval, number>> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
};
const MAX_TRACKED_TRADE_IDS_PER_SYMBOL = 5_000;

type AggregatedCandle = Readonly<{
  candle: ProviderCandle;
  firstTradeTs: number;
  lastTradeTs: number;
}>;

type SeenTrades = {
  ids: Set<string>;
  order: string[];
};

/**
 * Coinbase streams only five-minute candles. The app derives all displayed intervals from
 * the public trades stream so the subscription contract stays consistent across timeframes.
 */
@Injectable()
export class CandleAggregationService {
  private readonly candlesBySymbol = new Map<
    string,
    Map<ProviderCandleInterval, AggregatedCandle>
  >();
  private readonly seenTradesBySymbol = new Map<string, SeenTrades>();

  apply(event: ProviderMarketEvent): readonly ProviderCandleUpdateEvent[] {
    if (event.type !== "trades.batch") return [];
    return this.applyTrades(event);
  }

  seed(
    symbol: string,
    interval: ProviderCandleInterval,
    candle: ProviderCandle,
    marketTs: number,
  ): ProviderCandleUpdateEvent {
    const candlesByInterval = this.candlesBySymbol.get(symbol) ?? new Map();
    const existing = candlesByInterval.get(interval);

    if (!existing || candle.time >= existing.candle.time) {
      candlesByInterval.set(interval, {
        candle: { ...candle },
        firstTradeTs: candle.time * 1_000,
        // The REST response has no final trade timestamp. Let the next live trade advance close.
        lastTradeTs: candle.time * 1_000,
      });
      this.candlesBySymbol.set(symbol, candlesByInterval);
    }

    const current = candlesByInterval.get(interval) ?? existing;
    if (!current) throw new Error("Unable to seed the current candle");

    return {
      candle: { ...current.candle },
      interval,
      marketTs,
      providerSequence: 0,
      symbol,
      type: "candle.update",
    };
  }

  private applyTrades(event: ProviderTradesBatchEvent): readonly ProviderCandleUpdateEvent[] {
    const candlesByInterval = this.candlesBySymbol.get(event.symbol) ?? new Map();
    const changedIntervals = new Set<ProviderCandleInterval>();

    // Recent-trades storage is newest-first; candle construction must process oldest-first.
    for (const trade of [...event.trades].sort(compareTradesByTime)) {
      if (!this.recordTrade(event.symbol, trade.id)) continue;

      for (const interval of CANDLE_INTERVALS) {
        const next = applyTradeToCandle(candlesByInterval.get(interval), trade, interval);
        candlesByInterval.set(interval, next);
        changedIntervals.add(interval);
      }
    }

    if (changedIntervals.size === 0) return [];
    this.candlesBySymbol.set(event.symbol, candlesByInterval);

    return CANDLE_INTERVALS.flatMap((interval) => {
      if (!changedIntervals.has(interval)) return [];
      const aggregated = candlesByInterval.get(interval);
      if (!aggregated) return [];

      return [
        {
          candle: { ...aggregated.candle },
          interval,
          marketTs: event.marketTs,
          providerSequence: event.providerSequence,
          symbol: event.symbol,
          type: "candle.update" as const,
        },
      ];
    });
  }

  private recordTrade(symbol: string, tradeId: string): boolean {
    const seen = this.seenTradesBySymbol.get(symbol) ?? { ids: new Set<string>(), order: [] };
    if (seen.ids.has(tradeId)) return false;

    seen.ids.add(tradeId);
    seen.order.push(tradeId);
    this.seenTradesBySymbol.set(symbol, seen);

    if (seen.order.length <= MAX_TRACKED_TRADE_IDS_PER_SYMBOL) return true;

    const expiredId = seen.order.shift();
    if (expiredId) seen.ids.delete(expiredId);
    return true;
  }
}

function applyTradeToCandle(
  existing: AggregatedCandle | undefined,
  trade: ProviderTrade,
  interval: ProviderCandleInterval,
): AggregatedCandle {
  const time = getBucketStart(trade.marketTs, interval);

  if (!existing || existing.candle.time !== time) {
    return {
      candle: {
        close: trade.price,
        high: trade.price,
        low: trade.price,
        open: trade.price,
        time,
        volume: trade.quantity,
      },
      firstTradeTs: trade.marketTs,
      lastTradeTs: trade.marketTs,
    };
  }

  return {
    candle: {
      close: trade.marketTs >= existing.lastTradeTs ? trade.price : existing.candle.close,
      high: maxUnsignedDecimal(existing.candle.high, trade.price),
      low: minUnsignedDecimal(existing.candle.low, trade.price),
      open: trade.marketTs < existing.firstTradeTs ? trade.price : existing.candle.open,
      time,
      volume: addUnsignedDecimals(existing.candle.volume, trade.quantity),
    },
    firstTradeTs: Math.min(existing.firstTradeTs, trade.marketTs),
    lastTradeTs: Math.max(existing.lastTradeTs, trade.marketTs),
  };
}

function compareTradesByTime(left: ProviderTrade, right: ProviderTrade): number {
  if (left.marketTs !== right.marketTs) return left.marketTs - right.marketTs;
  return left.id.localeCompare(right.id);
}

function getBucketStart(marketTs: number, interval: ProviderCandleInterval): number {
  const intervalSeconds = SECONDS_BY_INTERVAL[interval];
  return Math.floor(Math.floor(marketTs / 1_000) / intervalSeconds) * intervalSeconds;
}

function addUnsignedDecimals(left: string, right: string): string {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  const fractionLength = Math.max(leftFraction.length, rightFraction.length);
  const leftValue = BigInt(`${leftInteger}${leftFraction.padEnd(fractionLength, "0")}`);
  const rightValue = BigInt(`${rightInteger}${rightFraction.padEnd(fractionLength, "0")}`);
  const combined = (leftValue + rightValue).toString().padStart(fractionLength + 1, "0");

  if (fractionLength === 0) return combined;

  const integer = combined.slice(0, -fractionLength);
  const fraction = combined.slice(-fractionLength).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function maxUnsignedDecimal(left: string, right: string): string {
  return compareUnsignedDecimals(left, right) >= 0 ? left : right;
}

function minUnsignedDecimal(left: string, right: string): string {
  return compareUnsignedDecimals(left, right) <= 0 ? left : right;
}

function compareUnsignedDecimals(left: string, right: string): number {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");

  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length < rightInteger.length ? -1 : 1;
  }
  if (leftInteger !== rightInteger) return leftInteger < rightInteger ? -1 : 1;

  const fractionLength = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeft = leftFraction.padEnd(fractionLength, "0");
  const normalizedRight = rightFraction.padEnd(fractionLength, "0");
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft < normalizedRight ? -1 : 1;
}
