import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import WebSocket from "ws";

import type {
  MarketDataProvider,
  ProviderChannel,
  ProviderSubscription,
} from "./market-data-provider";

export const COINBASE_MARKET_DATA_URL = "wss://advanced-trade-ws.coinbase.com";
export const COINBASE_PROVIDER_OPTIONS = Symbol("COINBASE_PROVIDER_OPTIONS");
export const COINBASE_HEARTBEATS_CHANNEL = "heartbeats";

const COINBASE_CHANNEL_BY_PROVIDER_CHANNEL: Readonly<Record<ProviderChannel, string>> = {
  candles: "candles",
  orderbook: "level2",
  ticker: "ticker",
  trades: "market_trades",
};

export type CoinbaseSocketFactory = (url: string) => WebSocket;

export type CoinbaseProviderOptions = Readonly<{
  endpoint?: string;
  socketFactory?: CoinbaseSocketFactory;
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

@Injectable()
export class CoinbaseProvider implements MarketDataProvider {
  private readonly endpoint: string;
  private readonly logger = new Logger(CoinbaseProvider.name);
  private readonly socketFactory: CoinbaseSocketFactory;
  private connectionAttempt: Promise<void> | undefined;
  private socket: WebSocket | undefined;

  constructor(
    @Optional()
    @Inject(COINBASE_PROVIDER_OPTIONS)
    options: CoinbaseProviderOptions = {},
  ) {
    this.endpoint = options.endpoint ?? COINBASE_MARKET_DATA_URL;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
  }

  connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectionAttempt) {
      return this.connectionAttempt;
    }

    const socket = this.socketFactory(this.endpoint);
    this.socket = socket;
    this.attachLifecycleLogging(socket);

    const attempt = new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        socket.off("close", handleCloseBeforeOpen);
        socket.off("error", handleConnectionError);
        socket.off("open", handleOpen);
      };
      const handleOpen = (): void => {
        try {
          this.subscribeToHeartbeats(socket);
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
        this.logger.log("Connected to Coinbase market data WebSocket");
        resolve();
      };
      const handleConnectionError = (error: Error): void => {
        cleanup();
        if (this.socket === socket) this.socket = undefined;
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
    });
    this.connectionAttempt = trackedAttempt;

    return trackedAttempt;
  }

  async close(): Promise<void> {
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
    this.sendSubscriptionCommands("subscribe", request);
  }

  unsubscribe(request: ProviderSubscription): void {
    this.sendSubscriptionCommands("unsubscribe", request);
  }

  private attachLifecycleLogging(socket: WebSocket): void {
    socket.on("close", (code) => {
      if (this.socket === socket) this.socket = undefined;
      this.logger.warn(`Coinbase market data WebSocket closed (code ${code})`);
    });
    socket.on("error", (error) => {
      this.logger.error(`Coinbase market data WebSocket error: ${error.message}`);
    });
  }

  private subscribeToHeartbeats(socket: WebSocket): void {
    const command: CoinbaseHeartbeatSubscriptionCommand = {
      channel: COINBASE_HEARTBEATS_CHANNEL,
      type: "subscribe",
    };

    // Coinbase closes otherwise quiet subscriptions after 60–90 seconds.
    socket.send(JSON.stringify(command));
  }

  private sendSubscriptionCommands(
    type: CoinbaseSubscriptionCommand["type"],
    request: ProviderSubscription,
  ): void {
    const socket = this.socket;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Coinbase market data WebSocket is not connected");
    }

    const productIds = [...new Set(request.symbols)];
    const channels = [...new Set(request.channels)];

    if (productIds.length === 0) {
      throw new Error("Coinbase subscription requires at least one market symbol");
    }

    if (channels.length === 0) {
      throw new Error("Coinbase subscription requires at least one channel");
    }

    for (const channel of channels) {
      const command: CoinbaseSubscriptionCommand = {
        channel: COINBASE_CHANNEL_BY_PROVIDER_CHANNEL[channel],
        product_ids: productIds,
        type,
      };

      socket.send(JSON.stringify(command));
    }
  }
}
