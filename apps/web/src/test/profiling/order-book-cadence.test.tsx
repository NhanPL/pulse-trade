import { Profiler } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { OrderBookSnapshotEvent, OrderBookUpdateEvent } from "@pulse-trade/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  orderBookStore,
  ORDER_BOOK_PRESENTATION_INTERVAL_MS,
} from "@/features/realtime/stores/order-book-store";
import { tickerStore } from "@/features/realtime/stores/ticker-store";
import { OrderBook } from "@/features/trading/components/order-book/OrderBook";
import type { OrderBookLevelRowProps } from "@/features/trading/components/order-book/OrderBookLevelRow";
import { createOrderBookPreview } from "@/features/trading/components/order-book/order-book-preview";

import { tickerRenderProfile as profile } from "./render-profile";
import { createProfileFeed, seedLiveTradingPanels, tickerEvent } from "./ticker-profile-fixtures";

// The additional test-only memo has the same props comparison as the actual memoized row.
vi.mock("@/features/trading/components/order-book/OrderBookLevelRow", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/trading/components/order-book/OrderBookLevelRow")
    >();
  const { memo } = await import("react");
  const { profileComponent, tickerRenderProfile } = await import("./render-profile");
  const Row = profileComponent(
    (props) => `row.${props.side}.${props.level.price}`,
    actual.OrderBookLevelRow,
  );
  return {
    ...actual,
    OrderBookLevelRow: memo(function RowProbe(props: OrderBookLevelRowProps) {
      tickerRenderProfile.recordCall(`row.${props.side}.${props.level.price}`);
      return <Row {...props} />;
    }),
  };
});

function snapshot(symbol = "BTC-USD", sequence = "1"): OrderBookSnapshotEvent {
  return {
    v: 1,
    event: "orderbook.snapshot",
    symbol,
    ts: 200,
    data: { asks: [["50101", "1"]], bids: [["49999", "1"]], sequence },
  };
}

function delta(
  sequence: number,
  changes: OrderBookUpdateEvent["data"]["changes"] = [],
): OrderBookUpdateEvent {
  return {
    v: 1,
    event: "orderbook.update",
    symbol: "BTC-USD",
    ts: 200 + sequence,
    data: { changes, sequence: String(sequence) },
  };
}

describe("P02 order-book presentation cadence", () => {
  let feed: ReturnType<typeof createProfileFeed>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    tickerStore.setState({ tickers: {}, marketFreshness: {} });
    feed = createProfileFeed();
    feed.emit(tickerEvent("BTC-USD", "50000", 200));
    feed.emit(tickerEvent("ETH-USD", "3000", 200));
    seedLiveTradingPanels(feed);
    profile.reset();
  });

  afterEach(() => {
    cleanup();
    feed.destroy();
    orderBookStore.getState().clearOrderBook("ETH-USD");
    tickerStore.setState({ tickers: {}, marketFreshness: {} });
    expect(feed.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    profile.reset();
  });

  function mount() {
    const view = render(
      <Profiler id="book" onRender={profile.onRender}>
        <OrderBook baseAsset="BTC" midPrice="50000" quoteAsset="USD" symbol="BTC-USD" />
      </Profiler>,
    );
    const book = orderBookStore.getState().books["BTC-USD"];
    const preview = createOrderBookPreview("50000");
    for (const level of book?.asks ?? preview.asks)
      expect(profile.functionCalls(`row.ask.${level.price}`)).toBeGreaterThan(0);
    for (const level of book?.bids ?? preview.bids)
      expect(profile.functionCalls(`row.bid.${level.price}`)).toBeGreaterThan(0);
    profile.reset();
    return view;
  }

  function advance(ms = ORDER_BOOK_PRESENTATION_INTERVAL_MS) {
    act(() => vi.advanceTimersByTime(ms));
  }

  function expectSeedRowsUnchanged() {
    for (let index = 0; index < 20; index++) {
      expect(profile.commits(`row.ask.${50101 + index}`)).toBe(0);
      expect(profile.commits(`row.bid.${49999 - index}`)).toBe(0);
      expect(profile.functionCalls(`row.ask.${50101 + index}`)).toBe(0);
      expect(profile.functionCalls(`row.bid.${49999 - index}`)).toBe(0);
    }
  }

  it("coalesces 100 separately committed ticker events and leaves all 40 displayed rows untouched", () => {
    mount();
    const before = orderBookStore.getState().books["BTC-USD"];
    for (let index = 1; index <= 100; index++) {
      act(() => feed.emit(tickerEvent("BTC-USD", String(50000 + index), 200 + index)));
    }
    expect(profile.commits("book")).toBe(0);
    expect(tickerStore.getState().tickers["BTC-USD"]?.price).toBe("50100");
    expect(orderBookStore.getState().books["BTC-USD"]).toBe(before);
    expect(vi.getTimerCount()).toBe(1);
    advance(49);
    expect(profile.commits("book")).toBe(0);
    advance(1);
    expect(profile.commits("book")).toBe(1);
    expect(screen.getByText("$50,100.00")).toBeInTheDocument();
    expect(orderBookStore.getState().books["BTC-USD"].asks).toBe(before.asks);
    expect(orderBookStore.getState().books["BTC-USD"].bids).toBe(before.bids);
    expectSeedRowsUnchanged();
    console.info(
      JSON.stringify({
        profile: "P02",
        workload: "100-ticker-burst",
        events: 100,
        presentationWindowMs: 50,
        measurements: profile.report(["book", "row.ask.50101", "row.bid.49999"]),
      }),
    );
  });

  it("publishes 20 times for 100 price events over a simulated second instead of resetting the deadline", () => {
    mount();
    for (let index = 1; index <= 100; index++) {
      act(() => {
        feed.emit(tickerEvent("BTC-USD", String(50000 + index), 200 + index));
        vi.advanceTimersByTime(10);
      });
    }
    expect(profile.commits("book")).toBe(20);
    expect(screen.getByText("$50,100.00")).toBeInTheDocument();
    expectSeedRowsUnchanged();
    console.info(
      JSON.stringify({
        profile: "P02",
        workload: "100Hz-ticker-1000ms",
        events: 100,
        measurements: profile.report(["book", "row.ask.50101", "row.bid.49999"]),
      }),
    );
  });

  it("retains every intermediate delta while combining deltas and price in the same publication", () => {
    mount();
    for (let index = 1; index <= 100; index++) {
      act(() => {
        feed.emit(
          delta(index + 1, [
            { side: "BID", price: "49999", quantity: String(index) },
            ...(index === 1
              ? [
                  { side: "ASK" as const, price: "50101", quantity: "0" },
                  { side: "BID" as const, price: "50000", quantity: "0.125" },
                ]
              : []),
          ]),
        );
        feed.emit(tickerEvent("BTC-USD", String(50000 + index), 200 + index));
      });
    }
    expect(profile.commits("book")).toBe(0);
    advance();
    expect(profile.commits("book")).toBe(1);
    const book = orderBookStore.getState().books["BTC-USD"];
    expect(book.sequence).toBe("101");
    expect(book.status).toBe("READY");
    expect(book.midPrice).toBe("50100");
    expect(book.asks.some((level) => level.price === "50101")).toBe(false);
    expect(book.bids.find((level) => level.price === "50000")?.quantity).toBe("0.125");
    expect(book.bids.find((level) => level.price === "49999")?.quantity).toBe("100");
    expect(
      within(screen.getByRole("rowgroup", { name: "Asks, sell orders" })).queryByText("$50,101.00"),
    ).not.toBeInTheDocument();
  });

  it("coalesces sustained 100Hz deltas and tickers into the same 20 publications", () => {
    mount();
    for (let index = 1; index <= 100; index++) {
      act(() => {
        feed.emit(delta(index + 1, [{ side: "BID", price: "49999", quantity: String(index) }]));
        feed.emit(tickerEvent("BTC-USD", String(50000 + index), 200 + index));
        vi.advanceTimersByTime(10);
      });
    }
    expect(profile.commits("book")).toBe(20);
    const book = orderBookStore.getState().books["BTC-USD"];
    expect(book.sequence).toBe("101");
    expect(book.bids[0].quantity).toBe("100");
    expect(book.midPrice).toBe("50100");
    for (let index = 0; index < 20; index++)
      expect(profile.functionCalls(`row.ask.${50101 + index}`)).toBe(0);
    console.info(
      JSON.stringify({
        profile: "P02",
        workload: "100Hz-delta-and-ticker-1000ms",
        events: 200,
        measurements: profile.report(["book", "row.ask.50101", "row.bid.49999"]),
      }),
    );
  });

  it("does not render metadata-only ticks, no-op deltas or changes outside the visible top 20", () => {
    mount();
    const before = orderBookStore.getState().books["BTC-USD"];
    for (let index = 1; index <= 100; index++) {
      act(() => {
        feed.emit(tickerEvent("BTC-USD", "50000", 200 + index));
        feed.emit(
          delta(index + 1, [
            { side: "BID", price: "49999", quantity: "0.01" },
            { side: "ASK", price: "60000", quantity: String(index) },
          ]),
        );
      });
      advance();
    }
    expect(orderBookStore.getState().books["BTC-USD"].sequence).toBe("101");
    expect(orderBookStore.getState().books["BTC-USD"].asks).toBe(before.asks);
    expect(orderBookStore.getState().books["BTC-USD"].bids).toBe(before.bids);
    expect(profile.commits("book")).toBe(0);
    // The off-screen update was ingested, not discarded: remove the twenty better asks to reveal it.
    act(() =>
      feed.emit(
        delta(
          102,
          before.asks.map((level) => ({ side: "ASK", price: level.price, quantity: "0" })),
        ),
      ),
    );
    advance();
    expect(orderBookStore.getState().books["BTC-USD"].asks).toEqual([
      { price: "60000", quantity: "100" },
    ]);
    expect(profile.commits("book")).toBe(1);
  });

  it("keeps the unchanged side memoized when a displayed bid quantity changes", () => {
    mount();
    const before = orderBookStore.getState().books["BTC-USD"];
    act(() => feed.emit(delta(2, [{ side: "BID", price: "49999", quantity: "1" }])));
    advance();
    const book = orderBookStore.getState().books["BTC-USD"];
    expect(book.asks).toBe(before.asks);
    expect(book.bids).not.toBe(before.bids);
    expect(profile.commits("book")).toBe(1);
    expect(profile.commits("row.bid.49999")).toBe(1);
    for (let index = 0; index < 20; index++)
      expect(profile.commits(`row.ask.${50101 + index}`)).toBe(0);
  });

  it("retains valid changes before a gap, rejects the corrupt delta and recovers with a snapshot", () => {
    mount();
    act(() => {
      feed.emit(delta(2, [{ side: "BID", price: "49999", quantity: "2" }]));
      feed.emit(delta(4, [{ side: "BID", price: "49999", quantity: "9" }]));
    });
    advance();
    expect(screen.getByText("Resyncing")).toBeInTheDocument();
    expect(orderBookStore.getState().books["BTC-USD"].bids[0].quantity).toBe("2");
    act(() => feed.emit(delta(5, [{ side: "BID", price: "49999", quantity: "8" }])));
    advance();
    expect(profile.commits("book")).toBe(1);
    act(() => feed.emit(snapshot("BTC-USD", "20")));
    advance();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(orderBookStore.getState().books["BTC-USD"].sequence).toBe("20");
    expect(orderBookStore.getState().books["BTC-USD"].bids[0].quantity).toBe("1");
  });

  it("retains price on stale data and publishes only a newer accepted ticker after recovery", () => {
    mount();
    act(() =>
      feed.emit({
        v: 1,
        event: "market.stale",
        symbol: "BTC-USD",
        ts: 201,
        data: { lastUpdateTs: 200, reason: "UPSTREAM_DISCONNECTED" },
      }),
    );
    advance();
    expect(profile.commits("book")).toBe(0);
    expect(screen.getByText("$50,000.00")).toBeInTheDocument();
    act(() => {
      feed.emit(tickerEvent("BTC-USD", "50100", 202));
      feed.emit(tickerEvent("BTC-USD", "49900", 199));
      feed.emit(tickerEvent("BTC-USD", "50100", 202));
    });
    advance();
    expect(profile.commits("book")).toBe(1);
    expect(screen.getByText("$50,100.00")).toBeInTheDocument();
  });

  it("cancels pending publication on route cleanup without resurrecting the cleared symbol", () => {
    const view = mount();
    act(() => feed.emit(tickerEvent("BTC-USD", "50100", 201)));
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    orderBookStore.getState().clearOrderBook("BTC-USD");
    expect(vi.getTimerCount()).toBe(0);
    act(() => feed.emit(tickerEvent("BTC-USD", "50200", 202)));
    advance();
    expect(orderBookStore.getState().books["BTC-USD"]).toBeUndefined();
    expect(profile.commits("book")).toBe(0);
  });

  it("shares one deadline across symbols and removes the ticker listener with the binding", () => {
    feed.emit(snapshot("ETH-USD"));
    advance();
    const ethereum = orderBookStore.getState().books["ETH-USD"];
    act(() => {
      feed.emit(tickerEvent("BTC-USD", "50100", 201));
      feed.emit(tickerEvent("ETH-USD", "3100", 201));
      feed.emit(tickerEvent("SOL-USD", "100", 201));
    });
    expect(vi.getTimerCount()).toBe(1);
    orderBookStore.getState().clearOrderBook("BTC-USD");
    advance();
    expect(orderBookStore.getState().books["BTC-USD"]).toBeUndefined();
    expect(orderBookStore.getState().books["SOL-USD"]).toBeUndefined();
    expect(orderBookStore.getState().books["ETH-USD"].midPrice).toBe("3100");
    expect(orderBookStore.getState().books["ETH-USD"].asks).toBe(ethereum.asks);
    feed.destroy();
    // Update the ticker store directly: releasing wire listeners alone would not catch this leak.
    tickerStore.getState().updateTicker({
      ...tickerStore.getState().tickers["ETH-USD"],
      price: "3200",
      marketTs: 300,
      eventTs: 300,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps bootstrap prices live and preview rows stable before the first book snapshot", () => {
    orderBookStore.getState().clearOrderBook("BTC-USD");
    mount();
    act(() => feed.emit(tickerEvent("BTC-USD", "50100", 201)));
    expect(screen.getByText("Snapshot")).toBeInTheDocument();
    expect(screen.getByText("$50,100.00")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    const preview = createOrderBookPreview("50000");
    for (const level of preview.asks)
      expect(profile.functionCalls(`row.ask.${level.price}`)).toBe(0);
    for (const level of preview.bids)
      expect(profile.functionCalls(`row.bid.${level.price}`)).toBe(0);
    act(() => feed.emit(snapshot()));
    advance();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(orderBookStore.getState().books["BTC-USD"].midPrice).toBe("50100");
  });
});
