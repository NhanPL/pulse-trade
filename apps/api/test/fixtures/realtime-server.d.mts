import type { MarketLiveEvent, MarketStaleEvent } from "@pulse-trade/contracts";
import type { MockMarketDataProvider } from "./mock-market-provider.mts";

export function startMockRealtimeServer(options?: { port?: number }): Promise<{
  url: string;
  provider: MockMarketDataProvider;
  close(): Promise<void>;
  activeClientCount(): number;
  freshness(symbol: string): MarketLiveEvent | MarketStaleEvent | undefined;
  disconnectClients(): void;
  advanceTime(milliseconds: number): void;
}>;
