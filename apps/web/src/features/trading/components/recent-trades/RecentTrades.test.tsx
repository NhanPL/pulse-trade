import { Profiler } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  recentTradesStore,
  type RecentTrade,
} from "@/features/realtime/stores/recent-trades-store";

import { RecentTrades } from "./RecentTrades";

function trades(start: number, count: number): RecentTrade[] {
  return Array.from({ length: count }, (_, offset) => ({
    id: `trade-${start + offset}`,
    marketTs: 1_800_000_000_000 + start + offset,
    price: String(50000 + start + offset),
    quantity: "0.01250000",
    side: offset % 2 ? "BUY" : "SELL",
  }));
}

const props = { baseAsset: "BTC", midPrice: "50000", quoteAsset: "USD", symbol: "BTC-USD" };

afterEach(() => {
  recentTradesStore.getState().clearRecentTrades("BTC-USD");
  recentTradesStore.getState().clearRecentTrades("ETH-USD");
});

describe("P03 bounded Recent Trades presentation", () => {
  it("keeps six collapsed rows and at most fifty expanded rows during a continuing stream", async () => {
    const user = userEvent.setup();
    render(<RecentTrades {...props} />);
    const panel = screen.getByRole("region", { name: "Recent trades" });
    const rows = () => within(panel).getAllByRole("row").slice(1);
    expect(within(panel).getByText("Snapshot", { exact: true })).toBeInTheDocument();
    act(() => recentTradesStore.getState().updateRecentTrades("BTC-USD", trades(0, 1000)));
    expect(rows()).toHaveLength(6);
    const toggle = within(panel).getByRole("button", { name: "View all trades" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(rows()).toHaveLength(50);
    for (let start = 1000; start < 2000; start += 100) {
      act(() => recentTradesStore.getState().updateRecentTrades("BTC-USD", trades(start, 100)));
      expect(rows()).toHaveLength(50);
    }
    expect(rows()[0]).toHaveTextContent("$51,999.00");
    expect(rows().at(-1)).toHaveTextContent("$51,950.00");
    expect(within(panel).getByText("Live", { exact: true })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(rows()).toHaveLength(6);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("does not commit for another symbol or an unchanged replay", () => {
    act(() => recentTradesStore.getState().updateRecentTrades("BTC-USD", trades(0, 100)));
    let commits = 0;
    render(
      <Profiler
        id="trades"
        onRender={(_, phase) => {
          if (phase !== "mount") commits++;
        }}
      >
        <RecentTrades {...props} />
      </Profiler>,
    );
    const retained = recentTradesStore.getState().recentTradesBySymbol["BTC-USD"];
    act(() => {
      recentTradesStore.getState().updateRecentTrades("ETH-USD", trades(100, 100));
      recentTradesStore.getState().updateRecentTrades("BTC-USD", [...retained, ...retained]);
    });
    expect(commits).toBe(0);
  });

  it("returns to the finite Snapshot preview when cleared and switches to the next symbol's data", () => {
    act(() => recentTradesStore.getState().updateRecentTrades("BTC-USD", trades(0, 100)));
    const view = render(<RecentTrades {...props} />);
    act(() => recentTradesStore.getState().clearRecentTrades("BTC-USD"));
    expect(screen.getByText("Snapshot", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(7);
    act(() => recentTradesStore.getState().updateRecentTrades("ETH-USD", trades(100, 100)));
    view.rerender(<RecentTrades {...props} baseAsset="ETH" symbol="ETH-USD" />);
    expect(screen.getByText("Live", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("$50,199.00", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("$50,099.00", { exact: true })).not.toBeInTheDocument();
  });
});
