import { expect, test, type Page } from "@playwright/test";
import {
  candleIntervalSchema,
  historicalCandlesResponseSchema,
  realtimeCommandSchema,
  realtimeEventSchema,
} from "@pulse-trade/contracts";

import { SUPPORTED_MARKETS } from "../src/features/market/model/supported-markets";

async function mockPublicMarketData(page: Page) {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/(?:me|portfolio|orders|watchlist)(?:[/?]|$)/.test(request.url())) {
      privateRequests.push(request.url());
    }
  });
  await page.route("**/api/v1/markets/*/candles?**", (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    const url = new URL(route.request().url());
    const interval = candleIntervalSchema.parse(url.searchParams.get("interval"));
    const seconds = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 }[interval];
    const time = Math.floor(Date.now() / 1000 / seconds) * seconds;
    return route.fulfill({
      json: historicalCandlesResponseSchema.parse({
        data: {
          symbol: url.pathname.split("/").at(-2),
          interval,
          candles: [time - seconds, time].map((time) => ({
            time,
            open: "50000",
            high: "50010",
            low: "49990",
            close: "50000",
            volume: "1",
          })),
        },
      }),
    });
  });
  await page.routeWebSocket(/\/realtime$/, (socket) => {
    socket.onMessage((message) => {
      const command = realtimeCommandSchema.parse(JSON.parse(message.toString()));
      if (command.action !== "subscribe") return;
      for (const symbol of command.symbols) {
        const ts = Date.now();
        const envelope = { v: 1, ts, symbol };
        for (const event of [
          {
            ...envelope,
            event: "ticker.update",
            data: {
              price: "50000",
              high24h: "50100",
              low24h: "49900",
              change24hPercent: "1.25",
              volume24h: "100",
              marketTs: ts,
            },
          },
          {
            ...envelope,
            event: "orderbook.snapshot",
            data: { asks: [["50010", "1"]], bids: [["49990", "1"]], sequence: "1" },
          },
          {
            ...envelope,
            event: "trades.batch",
            data: {
              trades: [
                {
                  id: `${symbol}-public`,
                  marketTs: ts,
                  price: "50000",
                  quantity: "1",
                  side: "BUY",
                },
              ],
            },
          },
        ]) {
          socket.send(JSON.stringify(realtimeEventSchema.parse(event)));
        }
      }
    });
  });
  return privateRequests;
}

async function expectPublicTradingWorkspace(page: Page, symbol: string) {
  await expect(page).toHaveURL(`/trade/${symbol}`);
  await expect(page.locator("[data-market-symbol]")).toHaveAttribute("data-market-symbol", symbol);
  await expect(page.getByRole("heading", { name: "Candlestick chart", exact: true })).toBeVisible();
  await expect(page.locator(`[data-chart-container="${symbol}"] canvas`).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Order book", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Order book", exact: true })).toContainText("Live");
  await expect(
    page.getByRole("heading", { name: "Checking your session", exact: true }),
  ).toHaveCount(0);
}

for (const viewport of [
  { name: "desktop", width: 1586, height: 992 },
  { name: "small mobile", width: 360, height: 800 },
]) {
  test(`${viewport.name} guest can open a market row with the mouse and its link with the keyboard`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route("**/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
    const privateRequests = await mockPublicMarketData(page);
    await page.goto("/");
    const btc = page.getByRole("link", { name: "Trade BTC-USD", exact: true });
    await expect(btc).toHaveAttribute("href", "/trade/BTC-USD");
    const row = btc.locator("xpath=ancestor::tr");
    await expect(
      row.getByRole("link", { name: "Sign in to add BTC-USD to watchlist", exact: true }),
    ).toBeVisible();
    await btc.focus();
    await expect(btc).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath("guest-market-link-focus.png"),
      fullPage: true,
    });
    await page.keyboard.press("Enter");
    await expectPublicTradingWorkspace(page, "BTC-USD");

    await page.goto("/");
    const priceCell = page
      .getByRole("link", { name: "Trade ETH-USD", exact: true })
      .locator("xpath=ancestor::tr")
      .getByRole("cell")
      .first();
    await priceCell.scrollIntoViewIfNeeded();
    const bounds = await priceCell.boundingBox();
    if (!bounds) throw new Error("The market price cell must be visible.");
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    // A real user clicks the native link stretched over this cell, not the covered td.
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href"),
        point,
      ),
    ).toBe("/trade/ETH-USD");
    await page.mouse.click(point.x, point.y);
    await expectPublicTradingWorkspace(page, "ETH-USD");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(privateRequests).toEqual([]);
  });
}

test("all supported market URLs open directly without authentication, including after reload", async ({
  page,
}) => {
  await page.route("**/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  const privateRequests = await mockPublicMarketData(page);
  for (const { symbol } of SUPPORTED_MARKETS) {
    await page.goto(`/trade/${symbol}`);
    await expectPublicTradingWorkspace(page, symbol);
  }
  await page.reload();
  await expectPublicTradingWorkspace(page, "XRP-USD");
  expect(privateRequests).toEqual([]);
});

test("market navigation stays public when session verification is unavailable", async ({
  page,
}) => {
  await page.route("**/auth/refresh", (route) => route.fulfill({ status: 503, json: {} }));
  const privateRequests = await mockPublicMarketData(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry session", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Trade BTC-USD", exact: true }).click();
  await expectPublicTradingWorkspace(page, "BTC-USD");
  expect(privateRequests).toEqual([]);
});

test("market navigation never waits for an in-flight session check", async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/refresh", async (route) => {
    await pending;
    await route.fulfill({ status: 401, json: {} });
  });
  const privateRequests = await mockPublicMarketData(page);
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "Trade BTC-USD", exact: true }).click();
    await expectPublicTradingWorkspace(page, "BTC-USD");
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "Sign in to buy BTC", exact: true })).toBeEnabled();
  expect(privateRequests).toEqual([]);
});

test("guest BUY and SELL in both order modes require sign-in without calling private APIs", async ({
  page,
}) => {
  await page.route("**/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  const privateRequests = await mockPublicMarketData(page);
  for (const type of ["MARKET", "LIMIT"]) {
    for (const side of ["BUY", "SELL"]) {
      await page.goto("/trade/BTC-USD");
      await page.getByRole("tab", { name: type, exact: true }).click();
      await page.getByRole("tab", { name: side, exact: true }).click();
      await page
        .getByRole("button", { name: `Sign in to ${side.toLowerCase()} BTC`, exact: true })
        .click();
      await expect(page).toHaveURL(/\/login\?returnTo=%2Ftrade%2FBTC-USD$/);
    }
  }
  expect(privateRequests).toEqual([]);
});
