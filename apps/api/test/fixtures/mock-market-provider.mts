import type {
  MarketDataProvider,
  ProviderChannel,
  ProviderConnectionStateListener,
  ProviderEventListener,
  ProviderHistoricalCandlesRequest,
  ProviderMarketEvent,
  ProviderOrderBookChange,
  ProviderSubscription,
  ProviderTrade,
} from "../../src/markets/provider/market-data-provider.ts";

export type MockMarketOptions = Readonly<{
  now?: () => number;
  prices?: Readonly<Record<string, string>>;
}>;

/** Test-only normalized provider: no exchange URLs, sockets, database or implicit timers. */
export class MockMarketDataProvider implements MarketDataProvider {
  private readonly now: () => number;
  private readonly prices: Map<string, string>;
  private readonly events = new Set<ProviderEventListener>();
  private readonly connections = new Set<ProviderConnectionStateListener>();
  private readonly subscriptions = new Set<string>();
  private readonly sequences = new Map<string, number>();
  private readonly snapshots = new Map<string, ProviderMarketEvent>();
  private readonly starts = new Map<string, number>();
  private connected = false;

  constructor(options: MockMarketOptions = {}) {
    this.now = options.now ?? Date.now;
    this.prices = new Map(
      Object.entries(
        options.prices ?? {
          "BTC-USD": "50000",
          "ETH-USD": "3000",
          "SOL-USD": "200",
          "ADA-USD": "0.5",
          "XRP-USD": "1",
        },
      ),
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    this.emitConnection("CONNECTED");
    for (const symbol of this.prices.keys()) this.ticker(symbol);
    for (const key of this.subscriptions) {
      const snapshot = this.snapshots.get(key);
      if (snapshot && snapshot.type !== "ticker") this.publish(snapshot);
    }
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.emitConnection("DISCONNECTED");
  }

  async close(): Promise<void> {
    this.disconnect();
    this.events.clear();
    this.connections.clear();
    this.subscriptions.clear();
  }

  onConnectionState(listener: ProviderConnectionStateListener): () => void {
    this.connections.add(listener);
    return () => {
      this.connections.delete(listener);
    };
  }

  onEvent(listener: ProviderEventListener): () => void {
    this.events.add(listener);
    return () => {
      this.events.delete(listener);
    };
  }

  subscribe(request: ProviderSubscription): void {
    for (const symbol of new Set(request.symbols)) {
      this.price(symbol);
      for (const channel of new Set(request.channels)) {
        const key = this.key(symbol, channel);
        if (this.subscriptions.has(key)) continue;
        this.subscriptions.add(key);
        this.starts.set(key, (this.starts.get(key) ?? 0) + 1);
        if (channel === "ticker") this.ticker(symbol);
        if (channel === "orderbook") {
          const snapshot = this.snapshots.get(key);
          if (snapshot) this.publish(snapshot);
          else this.orderBookSnapshot(symbol);
        }
        if (channel === "trades") this.trades(symbol);
      }
    }
  }

  unsubscribe(request: ProviderSubscription): void {
    for (const symbol of request.symbols) {
      for (const channel of request.channels) this.subscriptions.delete(this.key(symbol, channel));
    }
  }

  subscriptionStarts(symbol: string, channel: ProviderChannel): number {
    return this.starts.get(this.key(symbol, channel)) ?? 0;
  }

  activeSubscriptions(): readonly string[] {
    return [...this.subscriptions].sort();
  }

  get listenerCounts(): Readonly<{ events: number; connections: number }> {
    return { events: this.events.size, connections: this.connections.size };
  }

  async getHistoricalCandles({ symbol, interval, limit }: ProviderHistoricalCandlesRequest) {
    const price = this.price(symbol);
    const seconds = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 }[interval];
    if (!seconds || !Number.isSafeInteger(limit) || limit < 1 || limit > 300)
      throw new Error("Invalid mock historical candle request.");
    const end = Math.floor(this.now() / 1000 / seconds) * seconds;
    return Array.from({ length: limit }, (_, index) => ({
      close: price,
      high: price,
      low: price,
      open: price,
      time: end - (limit - 1 - index) * seconds,
      volume: "1",
    }));
  }

  ticker(symbol: string, price = this.price(symbol)): void {
    this.price(symbol);
    this.prices.set(symbol, price);
    this.publish({
      type: "ticker",
      symbol,
      marketTs: this.now(),
      providerSequence: this.next(symbol, "ticker"),
      price,
      high24h: price,
      low24h: price,
      change24hPercent: "0",
      volume24h: "100",
    });
  }

  orderBookSnapshot(symbol: string): void {
    // Book sequence is channel-local so sibling ticker/trade updates do not manufacture gaps.
    const price = this.price(symbol);
    const step = Math.min(10, Number(price) / 100);
    this.publish({
      type: "orderbook.snapshot",
      symbol,
      marketTs: this.now(),
      providerSequence: this.next(symbol, "orderbook"),
      asks: [
        [price, "1"],
        [String(Number(price) + step), "2"],
      ],
      bids: [
        [String(Number(price) - step), "1"],
        [String(Number(price) - 2 * step), "2"],
      ],
    });
  }

  orderBookDelta(symbol: string, changes: readonly ProviderOrderBookChange[], gap = 0): void {
    if (!Number.isSafeInteger(gap) || gap < 0) throw new Error("Invalid mock sequence gap.");
    const key = this.key(symbol, "orderbook");
    this.sequences.set(key, (this.sequences.get(key) ?? 0) + gap);
    this.publish({
      type: "orderbook.update",
      symbol,
      changes: structuredClone(changes),
      marketTs: this.now(),
      providerSequence: this.next(symbol, "orderbook"),
    });
  }

  trades(symbol: string, trades?: readonly ProviderTrade[]): void {
    const sequence = this.next(symbol, "trades");
    this.publish({
      type: "trades.batch",
      symbol,
      marketTs: this.now(),
      providerSequence: sequence,
      trades: trades ?? [
        {
          id: `mock-${symbol}-${sequence}`,
          marketTs: this.now(),
          price: this.price(symbol),
          quantity: "0.01",
          side: "BUY",
        },
      ],
    });
  }

  publish(event: ProviderMarketEvent): void {
    this.price(event.symbol);
    // Retain a rebuilt book, not a delta, for upstream reconnect replay.
    if (event.type === "orderbook.update") {
      const key = this.key(event.symbol, "orderbook");
      const previous = this.snapshots.get(key);
      if (previous?.type === "orderbook.snapshot") {
        const asks = new Map(previous.asks);
        const bids = new Map(previous.bids);
        for (const change of event.changes) {
          const levels = change.side === "ASK" ? asks : bids;
          if (/^0(?:\.0+)?$/.test(change.quantity)) levels.delete(change.price);
          else levels.set(change.price, change.quantity);
        }
        this.snapshots.set(key, {
          ...event,
          type: "orderbook.snapshot",
          asks: [...asks],
          bids: [...bids],
        });
      }
    } else {
      const channel = event.type.startsWith("candle.")
        ? "candles"
        : event.type === "orderbook.snapshot"
          ? "orderbook"
          : event.type === "trades.batch"
            ? "trades"
            : "ticker";
      this.snapshots.set(this.key(event.symbol, channel), structuredClone(event));
    }
    if (!this.connected) return;
    for (const listener of this.events) listener(structuredClone(event));
  }

  private price(symbol: string): string {
    const price = this.prices.get(symbol);
    if (!price) throw new Error(`Unsupported mock market: ${symbol}.`);
    return price;
  }
  private key(symbol: string, channel: ProviderChannel): string {
    return `${symbol}:${channel}`;
  }
  private next(symbol: string, channel: ProviderChannel): number {
    const key = this.key(symbol, channel);
    const sequence = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, sequence);
    return sequence;
  }
  private emitConnection(state: "CONNECTED" | "DISCONNECTED"): void {
    for (const listener of this.connections) listener({ state, ts: this.now() });
  }
}
