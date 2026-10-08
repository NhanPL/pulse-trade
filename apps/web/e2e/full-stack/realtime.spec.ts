import {
  realtimeCommandSchema,
  realtimeEventSchema,
  type RealtimeEvent,
  type RealtimeCommand,
} from "@pulse-trade/contracts";
import { test, expect } from "./realtime-fixtures";

for (const viewport of [
  { name: "desktop", width: 1586, height: 992 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} receives snapshots/deltas and restores subscriptions after a real socket disconnect`, async ({
    page,
    realtimeServer,
  }) => {
    await page.setViewportSize(viewport);
    const events: RealtimeEvent[] = [];
    const commands: RealtimeCommand[] = [];
    const errors: string[] = [];
    let socketCount = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => {
      expect(socket.url()).toBe("ws://127.0.0.1:3111/realtime");
      socketCount++;
      socket.on("framereceived", ({ payload }) =>
        events.push(realtimeEventSchema.parse(JSON.parse(payload.toString()))),
      );
      socket.on("framesent", ({ payload }) =>
        commands.push(realtimeCommandSchema.parse(JSON.parse(payload.toString()))),
      );
    });
    await page.goto("/trade/BTC-USD");
    const header = page.getByRole("region", { name: "BTC/USD", exact: true });
    const book = page.getByRole("region", { name: "Order book", exact: true });
    const trades = page.getByRole("region", { name: "Recent trades", exact: true });
    await expect(header.getByText("$50,000.00", { exact: true }).first()).toBeVisible();
    await expect(book.getByText("Live", { exact: true })).toBeVisible();
    if (viewport.name === "mobile")
      await page.getByRole("tab", { name: "Recent trades", exact: true }).click();
    await expect(trades.getByText("Live", { exact: true })).toBeVisible();
    realtimeServer.advanceTime(1);
    const trade = {
      id: "o07-trade",
      marketTs: Date.now(),
      price: "50321",
      quantity: "0.125",
      side: "SELL" as const,
    };
    realtimeServer.provider.trades("BTC-USD", [trade, trade]);
    const tradeRow = trades.getByRole("row").filter({ hasText: "$50,321.00" });
    await expect(tradeRow).toHaveCount(1);
    await expect(tradeRow.getByRole("cell").nth(1)).toHaveText("0.125");
    await expect(tradeRow.getByText("SELL", { exact: true })).toBeVisible();
    if (viewport.name === "mobile")
      await page.getByRole("tab", { name: "Order book", exact: true }).click();
    await expect(page.getByRole("button", { name: "5m", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "BTC-USD candlestick chart" })).toBeVisible();
    expect(socketCount).toBe(1);
    expect(realtimeServer.provider.subscriptionStarts("BTC-USD", "orderbook")).toBe(1);
    expect(realtimeServer.provider.subscriptionStarts("BTC-USD", "trades")).toBe(1);

    realtimeServer.provider.orderBookDelta("BTC-USD", [
      { side: "BID", price: "49990", quantity: "0" },
      { side: "BID", price: "49985", quantity: "0.25" },
      { side: "ASK", price: "50000", quantity: "0.5" },
    ]);
    const bids = book.getByRole("rowgroup", { name: "Bids, buy orders" });
    await expect(bids.getByText("$49,990.00", { exact: true })).toHaveCount(0);
    await expect(bids.getByText("$49,985.00", { exact: true })).toBeVisible();
    const updatedBid = bids.getByRole("row").filter({ hasText: "49,985.00" });
    await expect(updatedBid.getByRole("cell").nth(1)).toHaveText("0.25");
    realtimeServer.provider.orderBookDelta(
      "BTC-USD",
      [{ side: "BID", price: "49985", quantity: "9" }],
      1,
    );
    await expect(book.getByText("Resyncing", { exact: true })).toBeVisible();
    await expect(updatedBid.getByRole("cell").nth(1)).toHaveText("0.25");
    // Existing client refuses a gap until the upstream supplies a fresh snapshot.
    realtimeServer.provider.orderBookSnapshot("BTC-USD");
    await expect(book.getByText("Live", { exact: true })).toBeVisible();

    const historyResponse = page.waitForResponse((response) =>
      response.url().includes("/candles?interval=5m"),
    );
    await page.getByRole("button", { name: "5m", exact: true }).click();
    expect((await historyResponse).status()).toBe(200);
    expect(realtimeServer.provider.subscriptionStarts("BTC-USD", "trades")).toBe(1);
    realtimeServer.advanceTime(15_001);
    await expect
      .poll(() =>
        events.some((event) => event.event === "market.stale" && event.symbol === "BTC-USD"),
      )
      .toBe(true);
    await expect(header.getByText("$50,000.00", { exact: true }).first()).toBeVisible();
    realtimeServer.provider.ticker("BTC-USD", "50123");
    await expect(header.getByText("$50,123.00", { exact: true })).toBeVisible();

    realtimeServer.disconnectClients();
    await expect(header.getByLabel("Market data status: Reconnecting")).toBeVisible();
    await expect.poll(() => socketCount).toBe(2);
    await expect(header.getByLabel("Market data status: Live")).toBeVisible();
    await expect
      .poll(() => realtimeServer.provider.subscriptionStarts("BTC-USD", "orderbook"))
      .toBe(2);
    expect(realtimeServer.activeClientCount()).toBe(1);
    const replay = commands.filter(
      (command) => command.action === "subscribe" && command.channels.includes("orderbook"),
    );
    expect(replay).toHaveLength(2);
    const candleReplay = commands.filter(
      (command) =>
        command.action === "subscribe" &&
        command.channels.includes("candles") &&
        command.options?.candleInterval === "5m",
    );
    expect(candleReplay).toHaveLength(2);
    realtimeServer.advanceTime(1);
    realtimeServer.provider.ticker("BTC-USD", "50234");
    await expect(header.getByText("$50,234.00", { exact: true })).toBeVisible();
    await expect(book.getByText("Live", { exact: true })).toBeVisible();
    await page.goto("/login");
    await expect.poll(() => realtimeServer.activeClientCount()).toBe(0);
    expect(realtimeServer.provider.activeSubscriptions()).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("symbol navigation releases the previous market and does not leak subscriptions", async ({
  page,
  realtimeServer,
}) => {
  const commands: RealtimeCommand[] = [];
  let sockets = 0;
  page.on("websocket", (socket) => {
    sockets++;
    socket.on("framesent", ({ payload }) =>
      commands.push(realtimeCommandSchema.parse(JSON.parse(payload.toString()))),
    );
  });
  await page.goto("/trade/BTC-USD");
  await expect(
    page.getByRole("region", { name: "Order book" }).getByText("Live", { exact: true }),
  ).toBeVisible();
  await page.goto("/trade/ETH-USD");
  await expect(page).toHaveURL("/trade/ETH-USD");
  const header = page.getByRole("region", { name: "ETH/USD", exact: true });
  await expect(header.getByText("$3,000.00", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Order book" }).getByText("Live", { exact: true }),
  ).toBeVisible();
  expect(sockets).toBe(2);
  expect(
    commands.some(
      (command) =>
        command.action === "subscribe" &&
        command.symbols.includes("ETH-USD") &&
        command.channels.includes("orderbook"),
    ),
  ).toBe(true);
  await expect
    .poll(() => realtimeServer.provider.activeSubscriptions())
    .toEqual(["ETH-USD:orderbook", "ETH-USD:ticker", "ETH-USD:trades"]);
  expect(realtimeServer.activeClientCount()).toBe(1);
  realtimeServer.advanceTime(1);
  realtimeServer.provider.ticker("BTC-USD", "77777");
  realtimeServer.provider.ticker("ETH-USD", "3012");
  await expect(header.getByText("$3,012.00", { exact: true })).toBeVisible();
  await expect(header.getByText("$77,777.00", { exact: true })).toHaveCount(0);
});
