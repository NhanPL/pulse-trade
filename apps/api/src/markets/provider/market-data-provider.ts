export const MARKET_DATA_PROVIDER = Symbol("MARKET_DATA_PROVIDER");

export type ProviderChannel = "ticker" | "candles" | "orderbook" | "trades";

export type ProviderCandleInterval = "1m" | "5m" | "15m" | "1h";

export type ProviderSubscriptionOptions = Readonly<{
  candleInterval?: ProviderCandleInterval;
}>;

export type ProviderSubscription = Readonly<{
  channels: readonly ProviderChannel[];
  options?: ProviderSubscriptionOptions;
  symbols: readonly string[];
}>;

export type ProviderTickerEvent = Readonly<{
  change24hPercent: string;
  high24h: string;
  low24h: string;
  marketTs: number;
  price: string;
  providerSequence: number;
  symbol: string;
  type: "ticker";
  volume24h: string;
}>;

export type ProviderCandle = Readonly<{
  close: string;
  high: string;
  low: string;
  open: string;
  time: number;
  volume: string;
}>;

export type ProviderCandleSnapshotEvent = Readonly<{
  candles: readonly ProviderCandle[];
  interval: ProviderCandleInterval;
  marketTs: number;
  providerSequence: number;
  symbol: string;
  type: "candle.snapshot";
}>;

export type ProviderCandleUpdateEvent = Readonly<{
  candle: ProviderCandle;
  interval: ProviderCandleInterval;
  marketTs: number;
  providerSequence: number;
  symbol: string;
  type: "candle.update";
}>;

export type ProviderCandleEvent = ProviderCandleSnapshotEvent | ProviderCandleUpdateEvent;

export type ProviderOrderBookLevel = readonly [price: string, quantity: string];

export type ProviderOrderBookChange = Readonly<{
  price: string;
  quantity: string;
  side: "ASK" | "BID";
}>;

export type ProviderOrderBookSnapshotEvent = Readonly<{
  asks: readonly ProviderOrderBookLevel[];
  bids: readonly ProviderOrderBookLevel[];
  marketTs: number;
  providerSequence: number;
  symbol: string;
  type: "orderbook.snapshot";
}>;

export type ProviderOrderBookUpdateEvent = Readonly<{
  changes: readonly ProviderOrderBookChange[];
  marketTs: number;
  providerSequence: number;
  symbol: string;
  type: "orderbook.update";
}>;

export type ProviderOrderBookEvent = ProviderOrderBookSnapshotEvent | ProviderOrderBookUpdateEvent;

export type ProviderTrade = Readonly<{
  id: string;
  marketTs: number;
  price: string;
  quantity: string;
  side: "BUY" | "SELL";
}>;

export type ProviderTradesBatchEvent = Readonly<{
  marketTs: number;
  providerSequence: number;
  symbol: string;
  trades: readonly ProviderTrade[];
  type: "trades.batch";
}>;

export type ProviderMarketEvent =
  ProviderTickerEvent | ProviderCandleEvent | ProviderOrderBookEvent | ProviderTradesBatchEvent;

export type ProviderEventListener = (event: ProviderMarketEvent) => void;

/**
 * Provider-neutral lifecycle boundary for upstream market-data connections.
 * Exchange payload parsing and normalization stay inside the provider implementation.
 */
export interface MarketDataProvider {
  close(): Promise<void>;
  connect(): Promise<void>;
  onEvent(listener: ProviderEventListener): () => void;
  subscribe(request: ProviderSubscription): void;
  unsubscribe(request: ProviderSubscription): void;
}
