import type { WatchlistItem } from "@pulse-trade/contracts";

import { isSupportedMarketSymbol } from "../../market/model/supported-markets";
import type { RealtimeConnectionState } from "../../../lib/realtime/RealtimeClient";
import type { MarketTicker, TickerStore } from "../../realtime/stores/ticker-store";

const assetNames: Readonly<Record<string, string>> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  ADA: "Cardano",
  XRP: "XRP",
};

export function watchlistMarketIdentity(symbol: string) {
  const [baseAsset = symbol, quoteAsset = ""] = symbol.split("-");
  return { baseAsset, quoteAsset, name: assetNames[baseAsset] ?? baseAsset };
}

export function watchlistTickerSymbols(items: readonly WatchlistItem[]): string[] {
  return [...new Set(items.map((item) => item.symbol).filter(isSupportedMarketSymbol))].sort();
}

export function watchlistMarketStatus(
  ticker: MarketTicker | undefined,
  isStale: boolean,
  connection: RealtimeConnectionState,
): "Live" | "Waiting" | "Delayed" {
  if (!ticker) return "Waiting";
  return isStale || connection !== "CONNECTED" ? "Delayed" : "Live";
}

// Returning a primitive keeps unrelated ticks and unchanged rankings outside the summary boundary.
export function watchlistTopMoverKey(symbols: readonly string[], state: TickerStore): string {
  let best: MarketTicker | undefined;
  for (const symbol of symbols) {
    const ticker = state.tickers[symbol];
    if (
      !ticker ||
      state.marketFreshness[symbol]?.status !== "LIVE" ||
      !Number.isFinite(Number(ticker.change24hPercent))
    )
      return "";
    if (
      !best ||
      Number(ticker.change24hPercent) > Number(best.change24hPercent) ||
      (Number(ticker.change24hPercent) === Number(best.change24hPercent) && symbol < best.symbol)
    )
      best = ticker;
  }
  return best ? `${best.symbol}|${best.change24hPercent}` : "";
}

export function watchlistFreshnessKey(symbols: readonly string[], state: TickerStore): string {
  return symbols
    .map((symbol) =>
      watchlistMarketStatus(
        state.tickers[symbol],
        state.marketFreshness[symbol]?.status === "STALE",
        "CONNECTED",
      ),
    )
    .join("|");
}

const volumeFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
export function formatWatchlistVolume(value: string): string {
  const amount = Number(value);
  return value.trim() && Number.isFinite(amount) && amount >= 0
    ? volumeFormatter.format(amount)
    : "—";
}
