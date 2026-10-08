import { Profiler, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useStore } from "zustand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteHeader } from "@/components/layout/RouteHeader";
import { MarketOverview } from "@/features/market/components/MarketOverview";
import { MARKET_TABLE_MOCK } from "@/features/market/model/market-table.mock";
import { PortfolioDashboard } from "@/features/portfolio/components/PortfolioDashboard";
import { candleStore } from "@/features/realtime/stores/candle-store";
import { connectionStateStore } from "@/features/realtime/stores/connection-state-store";
import { tickerStore } from "@/features/realtime/stores/ticker-store";
import { TradingGrid } from "@/features/trading/components/TradingGrid";
import { TradingHeaderPrice } from "@/features/trading/components/TradingHeaderPrice";
import { TradingMarketHeader } from "@/features/trading/components/TradingMarketHeader";
import { ChartPanel } from "@/features/trading/components/chart/ChartPanel";
import { OrderBook } from "@/features/trading/components/order-book/OrderBook";
import { OrderForm } from "@/features/trading/components/order-form/OrderForm";
import { RecentTrades } from "@/features/trading/components/recent-trades/RecentTrades";
import { WatchlistDashboard } from "@/features/watchlist/components/WatchlistDashboard";

import { tickerRenderProfile as profile } from "./render-profile";
import {
  createProfileFeed,
  createProfileQueryClient,
  seedLiveTradingPanels,
  tickerEvent,
  tradingSnapshot,
} from "./ticker-profile-fixtures";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trade/BTC-USD",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/features/auth/components/AuthSessionProvider", async () => {
  const { profileSession } = await import("./ticker-profile-fixtures");
  return { useAuthSession: () => profileSession };
});
// Transport lifecycle has its own real-WebSocket E2E suite. No network/REST refetch belongs in this workload.
vi.mock("@/features/portfolio/hooks/usePortfolioRealtime", () => ({
  usePortfolioRealtime: vi.fn(),
}));
vi.mock("@/features/watchlist/hooks/useWatchlistRealtime", () => ({
  useWatchlistRealtime: vi.fn(),
}));

const chart = vi.hoisted(() => ({ setData: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("lightweight-charts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lightweight-charts")>()),
  createChart: () => ({
    addSeries: () => ({ setData: chart.setData, update: chart.update }),
    applyOptions: vi.fn(),
    remove: chart.remove,
    timeScale: () => ({ fitContent: vi.fn() }),
  }),
}));

// These delegates execute the existing implementations, not substitute UI components.
vi.mock("@/components/layout/AppHeader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/layout/AppHeader")>();
  const { probeFunction } = await import("./render-profile");
  return { ...actual, AppHeader: probeFunction("shell", actual.AppHeader) };
});
vi.mock("@/features/trading/components/TradingMarketHeader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/trading/components/TradingMarketHeader")>();
  const { probeFunction } = await import("./render-profile");
  return {
    ...actual,
    TradingMarketHeader: probeFunction("trading.header", actual.TradingMarketHeader),
  };
});
vi.mock("@/features/trading/components/TradingHeaderPrice", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/trading/components/TradingHeaderPrice")>();
  const { profileComponent } = await import("./render-profile");
  return {
    ...actual,
    TradingHeaderPrice: profileComponent(
      (props) => `price.${props.symbol}`,
      actual.TradingHeaderPrice,
    ),
  };
});
vi.mock("@/features/trading/components/TradingGrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/trading/components/TradingGrid")>();
  const { probeFunction } = await import("./render-profile");
  return { ...actual, TradingGrid: probeFunction("trading.grid", actual.TradingGrid) };
});
vi.mock("@/features/trading/components/chart/ChartPanel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/trading/components/chart/ChartPanel")>();
  const { probeFunction } = await import("./render-profile");
  return { ...actual, ChartPanel: probeFunction("trading.chart", actual.ChartPanel) };
});
vi.mock("@/features/trading/components/order-form/OrderForm", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/trading/components/order-form/OrderForm")>();
  const { probeFunction } = await import("./render-profile");
  return { ...actual, OrderForm: probeFunction("trading.form", actual.OrderForm) };
});
vi.mock("@/features/portfolio/components/PortfolioDashboard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/portfolio/components/PortfolioDashboard")>();
  const { probeFunction } = await import("./render-profile");
  return {
    ...actual,
    PortfolioDashboard: probeFunction("portfolio.dashboard", actual.PortfolioDashboard),
  };
});
vi.mock("@/features/portfolio/components/BalancePanel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/portfolio/components/BalancePanel")>();
  const { probeFunction, profileComponent } = await import("./render-profile");
  return {
    ...actual,
    BalancePanel: profileComponent(
      "portfolio.cash",
      probeFunction("portfolio.cash", actual.BalancePanel),
    ),
  };
});
vi.mock("@/features/portfolio/components/HoldingsSection", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/portfolio/components/HoldingsSection")>();
  const { probeFunction, profileComponent } = await import("./render-profile");
  return {
    ...actual,
    HoldingsSection: profileComponent(
      "portfolio.holdings-tree",
      probeFunction("portfolio.holdings", actual.HoldingsSection),
    ),
  };
});
vi.mock("@/features/portfolio/components/PortfolioSummary", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/portfolio/components/PortfolioSummary")>();
  const { profileComponent } = await import("./render-profile");
  return {
    ...actual,
    PortfolioSummary: profileComponent("portfolio.summary", actual.PortfolioSummary),
  };
});
vi.mock("@/features/watchlist/components/WatchlistDashboard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/watchlist/components/WatchlistDashboard")>();
  const { probeFunction } = await import("./render-profile");
  return {
    ...actual,
    WatchlistDashboard: probeFunction("watchlist.dashboard", actual.WatchlistDashboard),
  };
});
vi.mock("@/features/watchlist/components/WatchlistMarketRow", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/watchlist/components/WatchlistMarketRow")>();
  const { profileComponent } = await import("./render-profile");
  return {
    ...actual,
    WatchlistMarketRow: profileComponent(
      (props) => `watchlist.${props.symbol}`,
      actual.WatchlistMarketRow,
    ),
  };
});
vi.mock("@/features/watchlist/components/WatchlistSummary", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/watchlist/components/WatchlistSummary")>();
  const { profileComponent } = await import("./render-profile");
  return {
    ...actual,
    WatchlistSummary: profileComponent("watchlist.summary", actual.WatchlistSummary),
  };
});
vi.mock("@/features/watchlist/components/WatchlistMarketStatus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/watchlist/components/WatchlistMarketStatus")>();
  const { profileComponent } = await import("./render-profile");
  return {
    ...actual,
    WatchlistMarketStatus: profileComponent("watchlist.status", actual.WatchlistMarketStatus),
  };
});

function Boundary({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Profiler id={id} onRender={profile.onRender}>
      {children}
    </Profiler>
  );
}

// Deliberately broad negative control, never imported by the app.
function BroadPrice({ symbol }: { symbol: string }) {
  const tickers = useStore(tickerStore, (state) => state.tickers);
  return <span>{tickers[symbol]?.price}</span>;
}

function PrimitivePrice({ symbol }: { symbol: string }) {
  const price = useStore(tickerStore, (state) => state.tickers[symbol]?.price);
  return <span>{price}</span>;
}

function TradingFixture() {
  const common = { baseAsset: "BTC", quoteAsset: "USD", symbol: "BTC-USD", midPrice: "50000" };
  return (
    <>
      <Boundary id="shell-tree">
        <RouteHeader />
      </Boundary>
      <Boundary id="trading.header-tree">
        <TradingMarketHeader {...tradingSnapshot} />
      </Boundary>
      <Boundary id="trading.grid-tree">
        <TradingGrid
          chart={
            <Boundary id="trading.chart">
              <ChartPanel onTimeframeChange={() => undefined} symbol="BTC-USD" timeframe="1m" />
            </Boundary>
          }
          orderBook={
            <Boundary id="trading.book">
              <OrderBook {...common} />
            </Boundary>
          }
          orderForm={
            <Boundary id="trading.form">
              <OrderForm {...common} currentPrice="50000" />
            </Boundary>
          }
          recentTrades={
            <Boundary id="trading.trades">
              <RecentTrades {...common} />
            </Boundary>
          }
        />
      </Boundary>
    </>
  );
}

describe("P01 ticker render profile", () => {
  let feed: ReturnType<typeof createProfileFeed>;
  let client: ReturnType<typeof createProfileQueryClient>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tickerStore.setState({ tickers: {}, marketFreshness: {} });
    candleStore.setState({ currentCandles: {} });
    connectionStateStore.getState().setConnectionState("CONNECTED");
    feed = createProfileFeed();
    feed.emit(tickerEvent("BTC-USD", "50000", 200));
    feed.emit(tickerEvent("ETH-USD", "3000", 200));
    seedLiveTradingPanels(feed);
    client = createProfileQueryClient();
    fetchSpy = vi.fn(() => Promise.reject(new Error("Profiling must not fetch")));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    profile.reset();
  });

  afterEach(() => {
    cleanup();
    feed.destroy();
    expect(feed.listenerCount()).toBe(0);
    client.clear();
    expect(fetchSpy).not.toHaveBeenCalled();
    tickerStore.setState({ tickers: {}, marketFreshness: {} });
    candleStore.setState({ currentCandles: {} });
    connectionStateStore.getState().setConnectionState("DISCONNECTED");
    profile.reset();
  });

  async function mount(children: ReactNode, expectedProbes: readonly string[] = []) {
    const view = render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
    await act(async () => undefined);
    for (const id of expectedProbes)
      expect(profile.functionCalls(id), `${id} probe is active`).toBeGreaterThan(0);
    profile.reset();
    return view;
  }

  function stream(symbol = "BTC-USD", samePrice = false) {
    // Separate commits avoid mistaking a synchronously batched burst for symbol isolation.
    for (let index = 1; index <= 100; index++) {
      act(() =>
        feed.emit(tickerEvent(symbol, samePrice ? "50000" : String(50000 + index), 200 + index)),
      );
    }
    expect(tickerStore.getState().tickers[symbol]?.price).toBe(samePrice ? "50000" : "50100");
  }

  function report(workload: string, ids: readonly string[]) {
    console.info(
      JSON.stringify({ profile: "P01", workload, events: 100, measurements: profile.report(ids) }),
    );
  }

  it("isolates the actual trading price/book updates from shell, grid, chart, trades and focused form", async () => {
    await mount(<TradingFixture />, [
      "shell",
      "trading.header",
      "trading.grid",
      "trading.chart",
      "trading.form",
    ]);
    const quantity = screen.getByRole("spinbutton", { name: /Quantity/ });
    fireEvent.change(quantity, { target: { value: "0.01" } });
    quantity.focus();
    await act(async () => undefined);
    profile.reset();
    stream();
    expect(screen.getByRole("table", { name: /Live BTC-USD order book/ })).toBeInTheDocument();
    expect(
      screen.getByText("$50,100.00", { selector: "[data-trading-price]" }),
    ).toBeInTheDocument();
    expect(quantity).toHaveValue(0.01);
    expect(quantity).toHaveFocus();
    expect(profile.commits("price.BTC-USD")).toBe(100);
    expect(profile.commits("trading.book")).toBe(100);
    expect(profile.commits("trading.header-tree")).toBe(100);
    expect(profile.commits("trading.grid-tree")).toBe(100);
    for (const id of ["shell", "trading.header", "trading.grid", "trading.chart", "trading.form"]) {
      expect(profile.functionCalls(id), id).toBe(0);
    }
    for (const id of ["shell-tree", "trading.chart", "trading.form", "trading.trades"]) {
      expect(profile.commits(id), id).toBe(0);
    }
    report("trading-price-change", [
      "shell",
      "shell-tree",
      "trading.header",
      "trading.header-tree",
      "price.BTC-USD",
      "trading.grid",
      "trading.grid-tree",
      "trading.book",
      "trading.chart",
      "trading.form",
      "trading.trades",
    ]);
  });

  it("compares broad subscriptions against deployed per-symbol selectors", async () => {
    await mount(
      <>
        <Boundary id="broad.BTC">
          <BroadPrice symbol="BTC-USD" />
        </Boundary>
        <Boundary id="broad.ETH">
          <BroadPrice symbol="ETH-USD" />
        </Boundary>
        <TradingHeaderPrice symbol="BTC-USD" price="50000" />
        <TradingHeaderPrice symbol="ETH-USD" price="3000" />
      </>,
    );
    stream();
    expect(profile.commits("broad.BTC")).toBe(100);
    expect(profile.commits("broad.ETH")).toBe(100);
    expect(profile.commits("price.BTC-USD")).toBe(100);
    expect(profile.commits("price.ETH-USD")).toBe(0);
    report("broad-vs-symbol-price-change", [
      "broad.BTC",
      "broad.ETH",
      "price.BTC-USD",
      "price.ETH-USD",
    ]);
  });

  it("characterizes same-price metadata updates without applying a production optimization", async () => {
    await mount(
      <>
        <TradingHeaderPrice symbol="BTC-USD" price="50000" />
        <Boundary id="primitive.BTC">
          <PrimitivePrice symbol="BTC-USD" />
        </Boundary>
        <Boundary id="trading.book">
          <OrderBook baseAsset="BTC" midPrice="50000" quoteAsset="USD" symbol="BTC-USD" />
        </Boundary>
        <Boundary id="watchlist-tree">
          <WatchlistDashboard />
        </Boundary>
        <Boundary id="portfolio-tree">
          <PortfolioDashboard />
        </Boundary>
      </>,
    );
    stream("BTC-USD", true);
    expect(profile.commits("price.BTC-USD")).toBe(100);
    expect(profile.commits("trading.book")).toBe(100);
    expect(profile.commits("primitive.BTC")).toBe(0);
    expect(profile.commits("watchlist.BTC-USD")).toBe(100);
    expect(profile.commits("watchlist.ETH-USD")).toBe(0);
    expect(profile.commits("portfolio.holdings-tree")).toBe(100);
    expect(profile.commits("portfolio.summary")).toBe(0);
    report("same-price-new-timestamp", [
      "price.BTC-USD",
      "primitive.BTC",
      "trading.book",
      "watchlist.BTC-USD",
      "watchlist.ETH-USD",
      "portfolio.holdings-tree",
      "portfolio.summary",
    ]);
  });

  it("updates only the affected watchlist row when price changes but 24h change/freshness do not", async () => {
    await mount(
      <Boundary id="watchlist-tree">
        <WatchlistDashboard />
      </Boundary>,
      ["watchlist.dashboard"],
    );
    stream();
    expect(screen.getByRole("table")).toHaveTextContent("$50,100.00");
    expect(profile.commits("watchlist.BTC-USD")).toBe(100);
    expect(profile.commits("watchlist.ETH-USD")).toBe(0);
    expect(profile.commits("watchlist.summary")).toBe(0);
    expect(profile.commits("watchlist.status")).toBe(0);
    expect(profile.functionCalls("watchlist.dashboard")).toBe(0);
    report("watchlist-price-change", [
      "watchlist-tree",
      "watchlist.dashboard",
      "watchlist.BTC-USD",
      "watchlist.ETH-USD",
      "watchlist.summary",
      "watchlist.status",
    ]);
  });

  it("updates live portfolio totals/holdings without re-running dashboard, cash or holdings container", async () => {
    await mount(
      <Boundary id="portfolio-tree">
        <PortfolioDashboard />
      </Boundary>,
      ["portfolio.dashboard", "portfolio.holdings", "portfolio.cash"],
    );
    stream();
    const summary = screen.getByRole("region", { name: "Portfolio summary" });
    expect(within(summary).getByText("$13,505.00")).toBeInTheDocument();
    expect(within(summary).getByText("-$495.00")).toBeInTheDocument();
    expect(within(summary).getByText("+$100.00")).toBeInTheDocument();
    expect(within(summary).getByText("$5,000.00")).toBeInTheDocument();
    expect(profile.commits("portfolio.summary")).toBe(100);
    expect(profile.commits("portfolio.holdings-tree")).toBe(100);
    expect(profile.commits("portfolio.cash")).toBe(0);
    for (const id of ["portfolio.dashboard", "portfolio.holdings", "portfolio.cash"]) {
      expect(profile.functionCalls(id), id).toBe(0);
    }
    report("portfolio-price-change", [
      "portfolio-tree",
      "portfolio.dashboard",
      "portfolio.summary",
      "portfolio.holdings-tree",
      "portfolio.holdings",
      "portfolio.cash",
    ]);
  });

  it("does not mistake static Markets for a realtime performance success; unrelated symbols stay isolated", async () => {
    await mount(
      <>
        <Boundary id="markets-static">
          <MarketOverview markets={MARKET_TABLE_MOCK} />
        </Boundary>
        <TradingFixture />
        <Boundary id="watchlist-tree">
          <WatchlistDashboard />
        </Boundary>
        <Boundary id="portfolio-tree">
          <PortfolioDashboard />
        </Boundary>
      </>,
    );
    const markets = screen.getByRole("table", { name: /Supported crypto markets/ });
    const initialMarkets = markets.textContent;
    stream("SOL-USD");
    for (const id of [
      "markets-static",
      "price.BTC-USD",
      "trading.book",
      "watchlist-tree",
      "portfolio-tree",
      "shell-tree",
    ]) {
      expect(profile.commits(id), id).toBe(0);
    }
    report("unrelated-SOL-price-change", [
      "markets-static",
      "price.BTC-USD",
      "trading.book",
      "watchlist-tree",
      "portfolio-tree",
      "shell-tree",
    ]);
    profile.reset();
    stream();
    expect(profile.commits("markets-static")).toBe(0);
    expect(markets.textContent).toBe(initialMarkets);
    expect(profile.commits("price.BTC-USD")).toBe(100);
  });

  it("preserves price across stale/reconnect and ignores duplicate/older events after recovery", async () => {
    await mount(<TradingFixture />);
    act(() =>
      feed.emit({
        v: 1,
        event: "market.stale",
        symbol: "BTC-USD",
        ts: 201,
        data: { lastUpdateTs: 200, reason: "UPSTREAM_DISCONNECTED" },
      }),
    );
    expect(tickerStore.getState().marketFreshness["BTC-USD"]?.status).toBe("STALE");
    act(() => connectionStateStore.getState().setConnectionState("RECONNECTING"));
    expect(
      screen.getByText("$50,000.00", { selector: "[data-trading-price]" }),
    ).toBeInTheDocument();
    expect(profile.functionCalls("shell")).toBe(1);
    act(() => {
      connectionStateStore.getState().setConnectionState("CONNECTED");
      feed.emit(tickerEvent("BTC-USD", "50100", 202));
    });
    expect(tickerStore.getState().marketFreshness["BTC-USD"]?.status).toBe("LIVE");
    profile.reset();
    act(() => {
      feed.emit(tickerEvent("BTC-USD", "50100", 202));
      feed.emit(tickerEvent("BTC-USD", "49900", 199));
    });
    expect(profile.commits("price.BTC-USD")).toBe(0);
    expect(profile.commits("trading.book")).toBe(0);
    expect(tickerStore.getState().tickers["BTC-USD"]?.price).toBe("50100");
  });

  it("stops rendering for the old symbol after the price consumer changes symbol", async () => {
    const view = await mount(<TradingHeaderPrice symbol="BTC-USD" price="50000" />);
    view.rerender(
      <QueryClientProvider client={client}>
        <TradingHeaderPrice symbol="ETH-USD" price="3000" />
      </QueryClientProvider>,
    );
    profile.reset();
    stream();
    expect(profile.commits("price.BTC-USD")).toBe(0);
    expect(profile.commits("price.ETH-USD")).toBe(0);
    expect(screen.getByText("$3,000.00", { selector: "[data-trading-price]" })).toBeInTheDocument();
    act(() => feed.emit(tickerEvent("ETH-USD", "3100", 301)));
    expect(profile.commits("price.ETH-USD")).toBe(1);
  });

  it("keeps candles imperative and removes the chart listener on unmount", async () => {
    const view = await mount(
      <Boundary id="trading.chart">
        <ChartPanel onTimeframeChange={() => undefined} symbol="BTC-USD" timeframe="1m" />
      </Boundary>,
    );
    chart.update.mockClear();
    for (let index = 1; index <= 100; index++) {
      act(() =>
        feed.emit({
          v: 1,
          event: "candle.update",
          symbol: "BTC-USD",
          ts: 200 + index,
          data: {
            interval: "1m",
            candle: {
              time: 120,
              open: "50000",
              high: "50100",
              low: "50000",
              close: String(50000 + index),
              volume: "1",
            },
          },
        }),
      );
    }
    expect(chart.update).toHaveBeenCalledTimes(100);
    expect(profile.commits("trading.chart")).toBe(0);
    report("candle-imperative-control", ["trading.chart"]);
    view.unmount();
    expect(chart.remove).toHaveBeenCalledOnce();
    act(() =>
      feed.emit({
        v: 1,
        event: "candle.update",
        symbol: "BTC-USD",
        ts: 400,
        data: {
          interval: "1m",
          candle: {
            time: 120,
            open: "50000",
            high: "50101",
            low: "50000",
            close: "50101",
            volume: "1",
          },
        },
      }),
    );
    expect(chart.update).toHaveBeenCalledTimes(100);
  });
});
