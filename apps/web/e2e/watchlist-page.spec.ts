import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import type { WatchlistItem } from "@pulse-trade/contracts";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "watch@example.com" };
const markets = [
  { symbol: "BTC-USD", price: "67542.31", change: "2.41", volume: "1000" },
  { symbol: "ETH-USD", price: "3482.67", change: "-1.85", volume: "12000" },
  { symbol: "SOL-USD", price: "174.21", change: "5.32", volume: "310000" },
  { symbol: "ADA-USD", price: "0.52", change: "-0.65", volume: "4800000" },
  { symbol: "XRP-USD", price: "0.61", change: "1.98", volume: "2150000" },
];
const saved = markets.map(({ symbol }, index): WatchlistItem => ({
  id: `123e4567-e89b-42d3-a456-42661417401${index}`,
  symbol,
  createdAt: "2026-10-04T00:00:00.000Z",
}));
type Command = { action: "subscribe" | "unsubscribe"; channels: string[]; symbols: string[] };

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function mockWatchlist(page: Page, items = saved) {
  const state = {
    items: [...items],
    reads: 0,
    removes: 0,
    readStatus: 200,
    removeStatus: 204,
    authStatus: 200,
    sockets: 0,
    autoTick: true,
    readGate: null as Promise<void> | null,
    authGate: null as Promise<void> | null,
    removeGate: null as Promise<void> | null,
  };
  let socket: WebSocketRoute | undefined;
  let ts = 100;
  const commands: Command[] = [];
  const session = {
    data: {
      user,
      accessToken: "synthetic-watchlist-page-token",
      tokenType: "Bearer",
      expiresIn: 900,
      session: {
        id: "123e4567-e89b-42d3-a456-426614174001",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    },
  };
  function sendTicker(symbol: string, price: string, change = "1.25", volume = "1000") {
    if (!socket) throw new Error("Watchlist socket is not connected");
    socket.send(
      JSON.stringify({
        v: 1,
        event: "ticker.update",
        ts: ++ts,
        symbol,
        data: {
          price,
          change24hPercent: change,
          high24h: price,
          low24h: price,
          volume24h: volume,
          marketTs: ts,
        },
      }),
    );
  }
  await page.routeWebSocket(/\/realtime$/, (webSocket) => {
    socket = webSocket;
    state.sockets++;
    webSocket.onMessage((message) => {
      const command = JSON.parse(message.toString()) as Command;
      commands.push(command);
      if (command.action === "subscribe" && state.autoTick)
        for (const symbol of command.symbols) {
          const market = markets.find((entry) => entry.symbol === symbol);
          if (market) sendTicker(symbol, market.price, market.change, market.volume);
        }
    });
  });
  await page.route("**/auth/refresh", async (route) => {
    await state.authGate;
    await route.fulfill({
      status: state.authStatus,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    }),
  );
  await page.route("**/auth/logout", (route) => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/watchlist(?:\/[^/?]+)?$/, async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer synthetic-watchlist-page-token");
    let status: number;
    if (route.request().method() === "GET") {
      state.reads++;
      await state.readGate;
      status = state.readStatus;
    } else {
      expect(route.request().method()).toBe("DELETE");
      state.removes++;
      await state.removeGate;
      status = state.removeStatus;
      if (status === 204)
        state.items = state.items.filter(
          (item) => item.symbol !== new URL(route.request().url()).pathname.split("/").at(-1),
        );
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body:
        status === 204
          ? undefined
          : JSON.stringify(
              status >= 400
                ? {
                    error: {
                      code: status === 401 ? "UNAUTHENTICATED" : "WATCHLIST_UNAVAILABLE",
                      message: "private database detail",
                      details: null,
                    },
                  }
                : { data: { items: state.items } },
            ),
    });
  });
  return {
    state,
    commands,
    sendTicker,
    stale(symbol: string) {
      socket!.send(
        JSON.stringify({
          v: 1,
          event: "market.stale",
          symbol,
          ts: ++ts,
          data: { lastUpdateTs: ts - 1, reason: "UPSTREAM_DISCONNECTED" },
        }),
      );
    },
    disconnect() {
      socket!.close({ code: 1012, reason: "Synthetic reconnect" });
    },
  };
}

function row(page: Page, symbol: string) {
  return page
    .getByRole("region", { name: "Saved markets", exact: true })
    .locator("tbody > tr")
    .filter({
      has: page.getByRole("button", { name: `Remove ${symbol} from watchlist`, exact: true }),
    });
}

test("watchlist auth gating prevents private reads and subscriptions, retaining the intended route", async ({
  page,
}) => {
  const runtime = await mockWatchlist(page);
  const gate = deferred();
  runtime.state.authGate = gate.promise;
  runtime.state.authStatus = 401;
  await page.goto("/watchlist");
  await expect(
    page.getByRole("heading", { name: "Checking your session", exact: true }),
  ).toBeVisible();
  expect(runtime.state.reads).toBe(0);
  expect(runtime.state.sockets).toBe(0);
  gate.resolve();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwatchlist$/);
  expect(runtime.state.reads).toBe(0);
  expect(runtime.state.sockets).toBe(0);
});

test("auth service failure is recoverable before the watchlist is fetched", async ({ page }) => {
  const runtime = await mockWatchlist(page);
  runtime.state.authStatus = 503;
  await page.goto("/watchlist");
  await expect(
    page.getByRole("heading", { name: "We couldn't verify your session", exact: true }),
  ).toBeVisible();
  expect(runtime.state.reads).toBe(0);
  expect(runtime.state.sockets).toBe(0);
  runtime.state.authStatus = 200;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
});

test("server-confirmed symbols use one REST query, only saved tickers and independent live rows", async ({
  page,
}) => {
  const runtime = await mockWatchlist(page, saved.slice(0, 2));
  await page.goto("/watchlist");
  const summary = page.getByRole("region", { name: "Watchlist summary", exact: true });
  await expect(summary).toContainText("2 symbols");
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  await expect(row(page, "ETH-USD")).toContainText("-1.85%");
  await expect(row(page, "ETH-USD")).toContainText("12,000 ETH");
  await expect(summary).toContainText("BTC/USD+2.41%");
  expect(runtime.state.reads).toBe(1);
  expect(runtime.commands).toHaveLength(1);
  expect(runtime.commands[0]).toMatchObject({
    action: "subscribe",
    channels: ["ticker"],
    symbols: ["BTC-USD", "ETH-USD"],
  });
  runtime.sendTicker("ETH-USD", "3550", "8.75", "12345");
  await expect(row(page, "ETH-USD")).toContainText("$3,550.00");
  await expect(row(page, "ETH-USD")).toContainText("+8.75%");
  await expect(summary).toContainText("ETH/USD+8.75%");
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  expect(runtime.state.reads).toBe(1);
  expect(runtime.commands).toHaveLength(1);
});

test("loading and absent quotes have placeholders without fabricated live values", async ({
  page,
}) => {
  const gate = deferred();
  const runtime = await mockWatchlist(page, saved.slice(0, 1));
  runtime.state.readGate = gate.promise;
  runtime.state.autoTick = false;
  await page.goto("/watchlist");
  await expect(page.getByRole("status", { name: "Watchlist loading", exact: true })).toBeVisible();
  expect(runtime.state.sockets).toBe(0);
  gate.resolve();
  await expect(row(page, "BTC-USD")).toContainText("Waiting");
  await expect(row(page, "BTC-USD")).not.toContainText("$0");
  await expect(page.getByText("Waiting for fresh prices", { exact: true })).toBeVisible();
  await expect(page.locator("footer[role=status]")).toContainText(
    "Waiting for live market prices.",
  );
  runtime.sendTicker("BTC-USD", "67542.31", "2.41");
  await expect(page.locator("footer[role=status]")).toContainText("Prices and data are real-time.");
});

test("remove is keyboard accessible, pending-safe and reconciles the ticker subscription", async ({
  page,
}) => {
  const runtime = await mockWatchlist(page, saved.slice(0, 2));
  const gate = deferred();
  runtime.state.removeGate = gate.promise;
  await page.goto("/watchlist");
  const remove = page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true });
  await expect(remove).toBeEnabled();
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAttribute("aria-busy", "true");
  await remove.evaluate((button) => (button as HTMLButtonElement).click());
  await expect.poll(() => runtime.state.removes).toBe(1);
  await expect(row(page, "BTC-USD")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove ETH-USD from watchlist", exact: true }),
  ).toBeEnabled();
  gate.resolve();
  await expect(row(page, "BTC-USD")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Watchlist summary" })).toContainText("1 symbol");
  await expect.poll(() => runtime.commands.length).toBe(3);
  expect(runtime.commands[1]).toMatchObject({
    action: "unsubscribe",
    channels: ["ticker"],
    symbols: ["BTC-USD", "ETH-USD"],
  });
  expect(runtime.commands[2]).toMatchObject({
    action: "subscribe",
    channels: ["ticker"],
    symbols: ["ETH-USD"],
  });
  expect(runtime.state.items.map((item) => item.symbol)).toEqual(["ETH-USD"]);
  expect(runtime.state.removes).toBe(1);
});

test("failed removal keeps membership, does not churn subscriptions, and retries safely", async ({
  page,
}) => {
  const runtime = await mockWatchlist(page, saved.slice(0, 2));
  runtime.state.removeStatus = 503;
  await page.goto("/watchlist");
  const remove = page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true });
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(
    page.getByRole("region", { name: "Saved markets" }).getByRole("alert"),
  ).toContainText("temporarily unavailable");
  await expect(remove).toBeEnabled();
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  expect(runtime.commands).toHaveLength(1);
  await expect(page.getByText("private database detail")).toHaveCount(0);
  runtime.state.removeStatus = 204;
  await remove.click();
  await expect(row(page, "BTC-USD")).toHaveCount(0);
});

test("initial and cached REST failures retry without discarding last quotes; expired reads hide the list", async ({
  page,
}) => {
  const runtime = await mockWatchlist(page, saved.slice(0, 2));
  runtime.state.readStatus = 503;
  await page.goto("/watchlist");
  await expect(
    page.getByRole("heading", { name: "Watchlist unavailable", exact: true }),
  ).toBeVisible();
  expect(runtime.state.sockets).toBe(0);
  runtime.state.readStatus = 200;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  runtime.state.readStatus = 503;
  runtime.state.removeStatus = 503;
  await page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh watchlist", exact: true })).toBeEnabled();
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  await expect(
    page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true }),
  ).toBeDisabled();
  runtime.state.readStatus = 200;
  await page.getByRole("button", { name: "Refresh watchlist", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true }),
  ).toBeEnabled();
  runtime.state.readStatus = 401;
  await page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to view your watchlist", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved markets", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in again", exact: true })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Fwatchlist",
  );
  await expect.poll(() => runtime.commands.at(-1)?.action).toBe("unsubscribe");
});

test("stale and reconnect states keep last quotes and restore only the current tickers", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const runtime = await mockWatchlist(page, saved.slice(0, 2));
  await page.goto("/watchlist");
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  runtime.stale("BTC-USD");
  await expect(row(page, "BTC-USD")).toContainText("Delayed");
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  await expect(page.getByText("Waiting for fresh prices", { exact: true })).toBeVisible();
  runtime.disconnect();
  await expect(row(page, "ETH-USD")).toContainText("Delayed");
  await expect(page.locator("footer[role=status]")).toContainText("Reconnecting");
  await expect.poll(() => runtime.state.sockets).toBe(2);
  await expect.poll(() => runtime.commands.length).toBe(2);
  expect(runtime.commands[1]).toMatchObject({
    action: "subscribe",
    channels: ["ticker"],
    symbols: ["BTC-USD", "ETH-USD"],
  });
  await expect(page.locator("footer[role=status]")).toContainText("Prices and data are real-time.");
  expect(runtime.state.reads).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("leaving the page or logging out releases the watchlist subscription", async ({ page }) => {
  const runtime = await mockWatchlist(page, saved.slice(0, 2));
  await page.goto("/watchlist");
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  await page.getByRole("link", { name: "Explore Markets", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => runtime.commands.at(-1)?.action).toBe("unsubscribe");
  await page.getByRole("link", { name: "Watchlist", exact: true }).click();
  await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
  await expect.poll(() => runtime.commands.at(-1)?.action).toBe("subscribe");
  runtime.state.authStatus = 401;
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwatchlist$/);
  await expect.poll(() => runtime.commands.at(-1)?.action).toBe("unsubscribe");
});

test("no saved symbols means no market connection and a route back to Markets", async ({
  page,
}) => {
  const runtime = await mockWatchlist(page, []);
  await page.goto("/watchlist");
  await expect(page.getByText("No saved markets yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Watchlist summary" })).toContainText("0 symbols");
  await expect(page.getByRole("link", { name: "Explore Markets", exact: true })).toHaveAttribute(
    "href",
    "/",
  );
  expect(runtime.state.sockets).toBe(0);
  expect(runtime.commands).toHaveLength(0);
});

for (const viewport of [
  { name: "desktop", width: 1586, height: 992 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "small-mobile", width: 320, height: 800 },
]) {
  test(`watchlist follows the screen hierarchy and readable controls on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockWatchlist(page);
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
    if (viewport.width < 1024)
      await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
    await expect(page.getByRole("link", { name: "Watchlist", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    if (viewport.width < 1024) await page.keyboard.press("Escape");
    const table = page.getByRole("region", { name: "Saved markets", exact: true }).locator("table");
    await expect(table.locator("tbody > tr")).toHaveCount(5);
    await expect(row(page, "BTC-USD")).toContainText("$67,542.31");
    await expect(page.getByRole("region", { name: "Watchlist summary" })).toContainText(
      "SOL/USD+5.32%",
    );
    for (const market of markets) {
      const button = page.getByRole("button", {
        name: `Remove ${market.symbol} from watchlist`,
        exact: true,
      });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const rect = await button.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(40);
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
      await expect(button.locator("svg")).toHaveCSS("color", "rgb(255, 82, 97)");
    }
    if (viewport.width >= 1024)
      await expect(table.getByRole("columnheader", { name: "Price", exact: true })).toBeVisible();
    else await expect(row(page, "BTC-USD").getByText("Price", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`watchlist-${viewport.name}.png`),
      fullPage: true,
    });
    const trade = page.getByRole("link", { name: "Trade BTC-USD", exact: true });
    await trade.focus();
    await expect(trade).toBeFocused();
    await expect(trade).toHaveAttribute("href", "/trade/BTC-USD");
  });
}
