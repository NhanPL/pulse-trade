import type {
  CandleInterval,
  RealtimeChannel,
  SubscribeCommand,
  UnsubscribeCommand,
} from "@pulse-trade/contracts";
import { Inject, Injectable } from "@nestjs/common";
import WebSocket from "ws";

import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type ProviderSubscription,
} from "../markets/provider/market-data-provider";

export type SubscriptionQuery = Readonly<{
  candleInterval?: CandleInterval;
  channel: RealtimeChannel;
  symbol: string;
}>;

type ClientSubscription = SubscriptionQuery;

type UpstreamReference = Readonly<{
  channel: RealtimeChannel;
  symbol: string;
}> & {
  count: number;
};

@Injectable()
export class SubscriptionRegistry {
  private readonly clientsBySubscription = new Map<string, Set<WebSocket>>();
  private readonly clientSubscriptions = new Map<WebSocket, Map<string, ClientSubscription>>();
  private readonly upstreamReferences = new Map<string, UpstreamReference>();

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
  ) {}

  registerClient(client: WebSocket): void {
    if (!this.clientSubscriptions.has(client)) this.clientSubscriptions.set(client, new Map());
  }

  removeClient(client: WebSocket): void {
    const subscriptions = this.clientSubscriptions.get(client);
    if (!subscriptions) return;

    this.clientSubscriptions.delete(client);
    for (const subscription of subscriptions.values()) {
      this.removeClientFromSubscription(client, subscription);
    }
    const stoppedSubscriptions = this.removeUpstreamReferences(subscriptions.values());
    this.notifyProvider("unsubscribe", stoppedSubscriptions);
  }

  subscribe(client: WebSocket, command: SubscribeCommand): void {
    const subscriptions = this.getOrRegisterClient(client);
    const addedSubscriptions = expandSubscribeCommand(command).filter(
      (subscription) => !subscriptions.has(createSubscriptionKey(subscription)),
    );

    if (addedSubscriptions.length === 0) return;

    for (const subscription of addedSubscriptions) {
      subscriptions.set(createSubscriptionKey(subscription), subscription);
      this.addClientToSubscription(client, subscription);
    }

    const startedSubscriptions = this.addUpstreamReferences(addedSubscriptions);
    if (startedSubscriptions.length === 0) return;

    try {
      this.provider.subscribe(toProviderSubscription(command));
    } catch (error) {
      for (const subscription of addedSubscriptions) {
        subscriptions.delete(createSubscriptionKey(subscription));
        this.removeClientFromSubscription(client, subscription);
      }
      this.removeUpstreamReferences(addedSubscriptions);
      throw error;
    }
  }

  unsubscribe(client: WebSocket, command: UnsubscribeCommand): void {
    const subscriptions = this.clientSubscriptions.get(client);
    if (!subscriptions) return;

    const symbols = new Set(command.symbols);
    const channels = new Set(command.channels);
    const removedSubscriptions = [...subscriptions.values()].filter(
      (subscription) => symbols.has(subscription.symbol) && channels.has(subscription.channel),
    );

    for (const subscription of removedSubscriptions) {
      subscriptions.delete(createSubscriptionKey(subscription));
      this.removeClientFromSubscription(client, subscription);
    }

    const stoppedSubscriptions = this.removeUpstreamReferences(removedSubscriptions);
    this.notifyProvider("unsubscribe", stoppedSubscriptions);
  }

  getSubscribers(query: SubscriptionQuery): readonly WebSocket[] {
    if (query.channel !== "candles") {
      return [...(this.clientsBySubscription.get(createSubscriptionKey(query)) ?? [])];
    }

    const subscribers = new Set<WebSocket>();
    const addSubscribers = (subscription: ClientSubscription): void => {
      for (const client of this.clientsBySubscription.get(createSubscriptionKey(subscription)) ??
        []) {
        subscribers.add(client);
      }
    };

    addSubscribers({ channel: query.channel, symbol: query.symbol });

    if (query.candleInterval) {
      addSubscribers(query);
    } else {
      for (const interval of ["1m", "5m", "15m", "1h"] as const) {
        addSubscribers({ candleInterval: interval, channel: query.channel, symbol: query.symbol });
      }
    }

    return [...subscribers];
  }

  getSubscribersForSymbol(symbol: string): readonly WebSocket[] {
    const subscribers: WebSocket[] = [];

    for (const [client, subscriptions] of this.clientSubscriptions) {
      if ([...subscriptions.values()].some((subscription) => subscription.symbol === symbol)) {
        subscribers.push(client);
      }
    }

    return subscribers;
  }

  getSubscribedSymbols(): readonly string[] {
    return [...new Set([...this.upstreamReferences.values()].map(({ symbol }) => symbol))];
  }

  get activeClientCount(): number {
    return this.clientSubscriptions.size;
  }

  private addUpstreamReferences(
    subscriptions: readonly ClientSubscription[],
  ): readonly UpstreamReference[] {
    const startedSubscriptions: UpstreamReference[] = [];

    for (const subscription of subscriptions) {
      const key = createUpstreamKey(subscription);
      const reference = this.upstreamReferences.get(key);

      if (reference) {
        reference.count += 1;
        continue;
      }

      const startedSubscription: UpstreamReference = {
        channel: subscription.channel,
        count: 1,
        symbol: subscription.symbol,
      };
      this.upstreamReferences.set(key, startedSubscription);
      startedSubscriptions.push(startedSubscription);
    }

    return startedSubscriptions;
  }

  private addClientToSubscription(client: WebSocket, subscription: ClientSubscription): void {
    const key = createSubscriptionKey(subscription);
    const clients = this.clientsBySubscription.get(key) ?? new Set<WebSocket>();
    clients.add(client);
    this.clientsBySubscription.set(key, clients);
  }

  private getOrRegisterClient(client: WebSocket): Map<string, ClientSubscription> {
    const subscriptions = this.clientSubscriptions.get(client);
    if (subscriptions) return subscriptions;

    const registeredSubscriptions = new Map<string, ClientSubscription>();
    this.clientSubscriptions.set(client, registeredSubscriptions);
    return registeredSubscriptions;
  }

  private notifyProvider(
    action: "subscribe" | "unsubscribe",
    subscriptions: readonly UpstreamReference[],
  ): void {
    const symbolsByChannel = new Map<RealtimeChannel, Set<string>>();

    for (const subscription of subscriptions) {
      const symbols = symbolsByChannel.get(subscription.channel) ?? new Set<string>();
      symbols.add(subscription.symbol);
      symbolsByChannel.set(subscription.channel, symbols);
    }

    for (const [channel, symbols] of symbolsByChannel) {
      this.provider[action]({ channels: [channel], symbols: [...symbols] });
    }
  }

  private removeClientFromSubscription(client: WebSocket, subscription: ClientSubscription): void {
    const key = createSubscriptionKey(subscription);
    const clients = this.clientsBySubscription.get(key);
    if (!clients) return;

    clients.delete(client);
    if (clients.size === 0) this.clientsBySubscription.delete(key);
  }

  private removeUpstreamReferences(
    subscriptions: Iterable<ClientSubscription>,
  ): readonly UpstreamReference[] {
    const stoppedSubscriptions: UpstreamReference[] = [];

    for (const subscription of subscriptions) {
      const key = createUpstreamKey(subscription);
      const reference = this.upstreamReferences.get(key);
      if (!reference) continue;

      reference.count -= 1;
      if (reference.count > 0) continue;

      this.upstreamReferences.delete(key);
      stoppedSubscriptions.push(reference);
    }

    return stoppedSubscriptions;
  }
}

function createSubscriptionKey(subscription: ClientSubscription): string {
  const candleInterval =
    subscription.channel === "candles" ? (subscription.candleInterval ?? "") : "";
  return `${createUpstreamKey(subscription)}\u0000${candleInterval}`;
}

function createUpstreamKey(subscription: Pick<ClientSubscription, "channel" | "symbol">): string {
  return `${subscription.symbol}\u0000${subscription.channel}`;
}

function expandSubscribeCommand(command: SubscribeCommand): readonly ClientSubscription[] {
  const subscriptions = new Map<string, ClientSubscription>();

  for (const symbol of new Set(command.symbols)) {
    for (const channel of new Set(command.channels)) {
      const subscription: ClientSubscription = {
        channel,
        symbol,
        ...(channel === "candles" && command.options?.candleInterval
          ? { candleInterval: command.options.candleInterval }
          : {}),
      };
      subscriptions.set(createSubscriptionKey(subscription), subscription);
    }
  }

  return [...subscriptions.values()];
}

function toProviderSubscription(command: SubscribeCommand): ProviderSubscription {
  return {
    channels: [...new Set(command.channels)],
    symbols: [...new Set(command.symbols)],
    ...(command.options ? { options: command.options } : {}),
  };
}
