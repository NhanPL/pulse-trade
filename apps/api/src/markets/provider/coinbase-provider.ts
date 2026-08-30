import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import WebSocket, { type RawData } from "ws";

import {
  normalizeCoinbaseCandleMessage,
  normalizeCoinbaseLevel2Message,
  normalizeCoinbaseTickerMessage,
} from "./coinbase-normalizer";
import type {
  ProviderEventListener,
  MarketDataProvider,
  ProviderChannel,
  ProviderMarketEvent,
  ProviderSubscription,
} from "./market-data-provider";

export const COINBASE_MARKET_DATA_URL = "wss://advanced-trade-ws.coinbase.com";
export const COINBASE_PROVIDER_OPTIONS = Symbol("COINBASE_PROVIDER_OPTIONS");
export const COINBASE_HEARTBEATS_CHANNEL = "heartbeats";
export const COINBASE_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;
export const COINBASE_RECONNECT_JITTER_RATIO = 0.2;
export const COINBASE_STABLE_CONNECTION_MS = 30_000;

const COINBASE_CHANNEL_BY_PROVIDER_CHANNEL: Readonly<Record<ProviderChannel, string>> = {
  candles: "candles",
  orderbook: "level2",
  ticker: "ticker",
  trades: "market_trades",
};

export type CoinbaseSocketFactory = (url: string) => WebSocket;

export type CoinbaseProviderOptions = Readonly<{
  endpoint?: string;
  random?: () => number;
  reconnectDelaysMs?: readonly number[];
  reconnectJitterRatio?: number;
  socketFactory?: CoinbaseSocketFactory;
  stableConnectionMs?: number;
}>;

type CoinbaseSubscriptionCommand = Readonly<{
  channel: string;
  product_ids: readonly string[];
  type: "subscribe" | "unsubscribe";
}>;

type CoinbaseHeartbeatSubscriptionCommand = Readonly<{
  channel: typeof COINBASE_HEARTBEATS_CHANNEL;
  type: "subscribe";
}>;

function decodeCoinbaseMessage(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

function getCoinbaseMessageChannel(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("channel" in value)) return undefined;
  return typeof value.channel === "string" ? value.channel : undefined;
}

export function calculateReconnectDelayMs(
  attempt: number,
  delaysMs: readonly number[] = COINBASE_RECONNECT_DELAYS_MS,
  jitterRatio = COINBASE_RECONNECT_JITTER_RATIO,
  randomValue = Math.random(),
): number {
  if (delaysMs.length === 0 || delaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new Error("Coinbase reconnect delays must contain non-negative finite values");
  }

  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new Error("Coinbase reconnect jitter ratio must be between 0 and 1");
  }

  const normalizedAttempt = Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt)) : 0;
  const baseDelay = delaysMs[Math.min(normalizedAttempt, delaysMs.length - 1)]!;
  const normalizedRandomValue = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0.5;
  const jitter = baseDelay * jitterRatio * (normalizedRandomValue * 2 - 1);
  const maximumDelay = Math.max(...delaysMs);

  return Math.min(maximumDelay, Math.max(0, Math.round(baseDelay + jitter)));
}

@Injectable()
export class CoinbaseProvider implements MarketDataProvider {
  // Desired subscriptions survive transient upstream disconnects and are replayed on open.
  private readonly activeSubscriptions = new Map<ProviderChannel, Set<string>>();
  private readonly endpoint: string;
  private readonly eventListeners = new Set<ProviderEventListener>();
  private readonly logger = new Logger(CoinbaseProvider.name);
  private readonly random: () => number;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly reconnectJitterRatio: number;
  private readonly socketFactory: CoinbaseSocketFactory;
  private readonly stableConnectionMs: number;
  private connectionAttempt: Promise<void> | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private shouldReconnect = false;
  private socket: WebSocket | undefined;
  private stableConnectionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    @Optional()
    @Inject(COINBASE_PROVIDER_OPTIONS)
    options: CoinbaseProviderOptions = {},
  ) {
    this.endpoint = options.endpoint ?? COINBASE_MARKET_DATA_URL;
    this.random = options.random ?? Math.random;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? COINBASE_RECONNECT_DELAYS_MS;
    this.reconnectJitterRatio = options.reconnectJitterRatio ?? COINBASE_RECONNECT_JITTER_RATIO;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
    this.stableConnectionMs = options.stableConnectionMs ?? COINBASE_STABLE_CONNECTION_MS;

    calculateReconnectDelayMs(0, this.reconnectDelaysMs, this.reconnectJitterRatio, 0.5);

    if (!Number.isFinite(this.stableConnectionMs) || this.stableConnectionMs < 0) {
      throw new Error("Coinbase stable connection duration must be a non-negative finite value");
    }
  }

  connect(): Promise<void> {
    if (!this.shouldReconnect) this.reconnectAttempt = 0;
    this.shouldReconnect = true;
    this.clearReconnectTimer();

    return this.openConnection();
  }

  async close(): Promise<void> {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.clearStableConnectionTimer();

    const socket = this.socket;

    if (!socket || socket.readyState === WebSocket.CLOSED) {
      this.socket = undefined;
      return;
    }

    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));

    if (socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
    } else if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000, "Application shutdown");
    }

    await closed;
    if (this.socket === socket) this.socket = undefined;
  }

  subscribe(request: ProviderSubscription): void {
    this.updateActiveSubscriptions("subscribe", request);
  }

  unsubscribe(request: ProviderSubscription): void {
    this.updateActiveSubscriptions("unsubscribe", request);
  }

  onEvent(listener: ProviderEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private openConnection(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectionAttempt) {
      return this.connectionAttempt;
    }

    const socket = this.socketFactory(this.endpoint);
    this.socket = socket;
    this.attachLifecycleLogging(socket);
    this.attachMessageHandling(socket);

    const attempt = new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        socket.off("close", handleCloseBeforeOpen);
        socket.off("error", handleConnectionError);
        socket.off("open", handleOpen);
      };
      const handleOpen = (): void => {
        try {
          this.subscribeToHeartbeats(socket);
          this.resubscribeActiveChannels(socket);
        } catch (error) {
          cleanup();
          if (this.socket === socket) this.socket = undefined;
          socket.terminate();
          reject(
            new Error("Failed to subscribe to Coinbase provider heartbeats", { cause: error }),
          );
          return;
        }

        cleanup();
        this.startStableConnectionTimer(socket);
        this.logger.log("Connected to Coinbase market data WebSocket");
        resolve();
      };
      const handleConnectionError = (error: Error): void => {
        cleanup();
        if (this.socket === socket) this.socket = undefined;
        if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
        reject(new Error("Failed to connect to Coinbase market data WebSocket", { cause: error }));
      };
      const handleCloseBeforeOpen = (code: number): void => {
        cleanup();
        if (this.socket === socket) this.socket = undefined;
        reject(
          new Error(`Coinbase market data WebSocket closed before it was ready (code ${code})`),
        );
      };

      socket.once("open", handleOpen);
      socket.once("error", handleConnectionError);
      socket.once("close", handleCloseBeforeOpen);
    });

    const trackedAttempt = attempt.finally(() => {
      if (this.connectionAttempt === trackedAttempt) this.connectionAttempt = undefined;
      this.scheduleReconnect();
    });
    this.connectionAttempt = trackedAttempt;

    return trackedAttempt;
  }

  private attachLifecycleLogging(socket: WebSocket): void {
    socket.on("close", (code) => {
      const wasCurrentSocket = this.socket === socket;

      if (wasCurrentSocket) {
        this.socket = undefined;
        this.clearStableConnectionTimer();
      }

      this.logger.warn(`Coinbase market data WebSocket closed (code ${code})`);
      if (wasCurrentSocket) this.scheduleReconnect();
    });
    socket.on("error", (error) => {
      this.logger.error(`Coinbase market data WebSocket error: ${error.message}`);
      if (this.socket === socket && socket.readyState === WebSocket.OPEN) socket.terminate();
    });
  }

  private attachMessageHandling(socket: WebSocket): void {
    const handleMessage = (data: RawData): void => this.handleMessage(data);
    const handleClose = (): void => {
      socket.off("message", handleMessage);
    };

    socket.on("message", handleMessage);
    socket.once("close", handleClose);
  }

  private handleMessage(data: RawData): void {
    let message: unknown;

    try {
      message = JSON.parse(decodeCoinbaseMessage(data)) as unknown;
    } catch {
      this.logger.warn("Ignored malformed Coinbase WebSocket message");
      return;
    }

    const channel = getCoinbaseMessageChannel(message);
    if (channel !== "ticker" && channel !== "candles" && channel !== "l2_data") return;

    try {
      const events =
        channel === "ticker"
          ? normalizeCoinbaseTickerMessage(message)
          : channel === "candles"
            ? normalizeCoinbaseCandleMessage(message)
            : normalizeCoinbaseLevel2Message(message);

      for (const event of events) this.emitEvent(event);
    } catch {
      this.logger.warn(`Ignored invalid Coinbase ${channel} message`);
    }
  }

  private emitEvent(event: ProviderMarketEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown listener error";
        this.logger.error(`Market data provider listener failed: ${message}`);
      }
    }
  }

  private subscribeToHeartbeats(socket: WebSocket): void {
    const command: CoinbaseHeartbeatSubscriptionCommand = {
      channel: COINBASE_HEARTBEATS_CHANNEL,
      type: "subscribe",
    };

    // Coinbase closes otherwise quiet subscriptions after 60–90 seconds.
    socket.send(JSON.stringify(command));
  }

  private updateActiveSubscriptions(
    type: CoinbaseSubscriptionCommand["type"],
    request: ProviderSubscription,
  ): void {
    const productIds = [...new Set(request.symbols)];
    const channels = [...new Set(request.channels)];

    if (productIds.length === 0) {
      throw new Error("Coinbase subscription requires at least one market symbol");
    }

    if (channels.length === 0) {
      throw new Error("Coinbase subscription requires at least one channel");
    }

    for (const channel of channels) {
      const activeSymbols = this.activeSubscriptions.get(channel) ?? new Set<string>();
      const changedProductIds = productIds.filter((productId) =>
        type === "subscribe" ? !activeSymbols.has(productId) : activeSymbols.has(productId),
      );

      if (changedProductIds.length === 0) continue;

      for (const productId of changedProductIds) {
        if (type === "subscribe") activeSymbols.add(productId);
        else activeSymbols.delete(productId);
      }

      if (activeSymbols.size > 0) this.activeSubscriptions.set(channel, activeSymbols);
      else this.activeSubscriptions.delete(channel);

      const socket = this.socket;
      if (socket?.readyState === WebSocket.OPEN) {
        this.sendSubscriptionCommand(socket, type, channel, changedProductIds);
      }
    }
  }

  private resubscribeActiveChannels(socket: WebSocket): void {
    for (const [channel, symbols] of this.activeSubscriptions) {
      if (symbols.size > 0) {
        this.sendSubscriptionCommand(socket, "subscribe", channel, [...symbols]);
      }
    }
  }

  private sendSubscriptionCommand(
    socket: WebSocket,
    type: CoinbaseSubscriptionCommand["type"],
    channel: ProviderChannel,
    productIds: readonly string[],
  ): void {
    const command: CoinbaseSubscriptionCommand = {
      channel: COINBASE_CHANNEL_BY_PROVIDER_CHANNEL[channel],
      product_ids: productIds,
      type,
    };

    socket.send(JSON.stringify(command));
  }

  private scheduleReconnect(): void {
    if (
      !this.shouldReconnect ||
      this.reconnectTimer ||
      this.connectionAttempt ||
      this.socket?.readyState === WebSocket.CONNECTING ||
      this.socket?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    const delayMs = calculateReconnectDelayMs(
      this.reconnectAttempt,
      this.reconnectDelaysMs,
      this.reconnectJitterRatio,
      this.random(),
    );
    const attemptNumber = this.reconnectAttempt + 1;
    this.reconnectAttempt += 1;

    this.logger.warn(
      `Reconnecting to Coinbase market data WebSocket in ${delayMs}ms (attempt ${attemptNumber})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.shouldReconnect) return;

      void this.openConnection().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown connection error";
        this.logger.warn(`Coinbase market data reconnect attempt failed: ${message}`);
      });
    }, delayMs);
  }

  private startStableConnectionTimer(socket: WebSocket): void {
    this.clearStableConnectionTimer();

    this.stableConnectionTimer = setTimeout(() => {
      this.stableConnectionTimer = undefined;

      if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
        this.reconnectAttempt = 0;
      }
    }, this.stableConnectionMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private clearStableConnectionTimer(): void {
    if (!this.stableConnectionTimer) return;

    clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = undefined;
  }
}
