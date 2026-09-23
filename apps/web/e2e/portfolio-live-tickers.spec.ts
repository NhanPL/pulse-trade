import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-portfolio-live-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: { id: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2099-01-01T00:00:00.000Z" },
  },
};
const portfolio = {
  data: {
    cash: { available: "4000", locked: "1000" },
    positions: [
      { asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" },
      { asset: "ETH", averageCost: "3000", quantity: "2", realizedPnl: "0" },
      { asset: "ADA", averageCost: "0.5", quantity: "0", realizedPnl: "-2" },
    ],
    quoteCurrency: "USD",
  },
};

type RealtimeCommand = {
  action: "subscribe" | "unsubscribe";
  channels: string[];
  symbols: string[];
};

async function mockPortfolioRuntime(page: Page) {
  let portfolioRequests = 0;
  let socket: WebSocketRoute | undefined;
  let eventTimestamp = 100;
  const commands: RealtimeCommand[] = [];

  function sendTicker(symbol: string, price: string, change24hPercent = "1.25"): void {
    if (!socket) throw new Error("Portfolio WebSocket has not connected");
    eventTimestamp += 1;
    socket.send(
      JSON.stringify({
        v: 1,
        event: "ticker.update",
        ts: eventTimestamp,
        symbol,
        data: {
          price,
          change24hPercent,
          high24h: price,
          low24h: price,
          volume24h: "1000",
          marketTs: eventTimestamp,
        },
      }),
    );
  }

  await page.routeWebSocket(/\/realtime$/, (webSocket) => {
    socket = webSocket;
    webSocket.onMessage((message) => {
      const command = JSON.parse(message.toString()) as RealtimeCommand;
      commands.push(command);
      if (command.action !== "subscribe") return;
      if (command.symbols.includes("BTC-USD")) sendTicker("BTC-USD", "67542.31", "2.41");
      if (command.symbols.includes("ETH-USD")) sendTicker("ETH-USD", "3482.67", "1.85");
    });
  });
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }),
  );
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    }),
  );
  await page.route("**/api/v1/portfolio", async (route) => {
    portfolioRequests += 1;
    expect(route.request().headers().authorization).toBe("Bearer synthetic-portfolio-live-token");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(portfolio),
    });
  });

  return {
    commands,
    portfolioRequestCount: () => portfolioRequests,
    sendTicker,
  };
}

test("combines one account snapshot with narrow live ticker subscriptions", async ({
  page,
}, testInfo) => {
  const runtime = await mockPortfolioRuntime(page);
  await page.goto("/portfolio");

  const holdings = page.getByRole("region", { name: "Holdings", exact: true });
  const table = holdings.getByRole("table", { name: "Holdings table", exact: true });
  await expect(table.locator("tbody > tr")).toHaveCount(2);
  const bitcoin = table.getByRole("row", { name: /BTC Bitcoin/ });
  const ethereum = table.getByRole("row", { name: /ETH Ethereum/ });
  await expect(bitcoin).toContainText("$67,542.31");
  await expect(bitcoin).toContainText("$3,377.12");
  await expect(bitcoin).toContainText("+$377.12");
  await expect(bitcoin).toContainText("+12.57%");
  await expect(ethereum).toContainText("$3,482.67");
  await expect(ethereum).toContainText("$6,965.34");
  await expect(ethereum).toContainText("+$965.34");
  await expect(ethereum).toContainText("+16.09%");
  await expect(holdings.getByText("$10,342.46", { exact: true })).toBeVisible();
  const holdingsTotals = holdings.locator("footer");
  await expect(holdingsTotals).toContainText("+$1,342.46");
  await expect(holdingsTotals).toContainText("+14.92%");

  const summary = page.getByRole("region", { name: "Portfolio summary", exact: true });
  const totalValue = summary.locator("dl > div").filter({
    has: page.locator('summary[aria-label="About Total Value"]'),
  });
  const unrealizedPnl = summary.locator("dl > div").filter({
    has: page.locator('summary[aria-label="About Unrealized P&L"]'),
  });
  const realizedPnl = summary.locator("dl > div").filter({
    has: page.locator('summary[aria-label="About Realized P&L"]'),
  });
  await expect(totalValue.locator("dd").first()).toHaveText("$15,342.46");
  await expect(unrealizedPnl.locator("dd").first()).toHaveText("+$1,342.46");
  await expect(unrealizedPnl.locator("dd").nth(1)).toHaveText("+14.92%");
  await expect(realizedPnl.locator("dd").first()).toHaveText("+$98.00");
  await expect(realizedPnl.locator("dd").first()).toHaveClass(/text-positive/);
  await expect(realizedPnl.locator("dd").nth(1)).toHaveText("Completed sells · USD");
  expect(runtime.portfolioRequestCount()).toBe(1);
  await expect.poll(() => runtime.commands.length).toBeGreaterThanOrEqual(1);
  expect(runtime.commands[0]).toMatchObject({
    action: "subscribe",
    channels: ["ticker"],
    symbols: ["BTC-USD", "ETH-USD"],
  });

  runtime.sendTicker("BTC-USD", "70000", "3.10");
  await expect(bitcoin).toContainText("$70,000.00");
  await expect(bitcoin).toContainText("$3,500.00");
  await expect(bitcoin).toContainText("+$500.00");
  await expect(bitcoin).toContainText("+16.67%");
  await expect(holdings.getByText("$10,465.34", { exact: true })).toBeVisible();
  await expect(holdingsTotals).toContainText("+$1,465.34");
  await expect(holdingsTotals).toContainText("+16.28%");
  await expect(totalValue.locator("dd").first()).toHaveText("$15,465.34");
  await expect(unrealizedPnl.locator("dd").first()).toHaveText("+$1,465.34");
  await expect(unrealizedPnl.locator("dd").nth(1)).toHaveText("+16.28%");
  const search = holdings.getByRole("searchbox", { name: "Search holdings", exact: true });
  await search.fill("ETH");
  await expect(table.locator("tbody > tr")).toHaveCount(1);
  await expect(table.getByRole("row", { name: /ETH Ethereum/ })).toContainText("66.56%");
  await search.fill("");

  runtime.sendTicker("BTC-USD", "50000", "-4.25");
  runtime.sendTicker("ETH-USD", "2500", "-5.10");
  await expect(bitcoin).toContainText("-$500.00");
  await expect(bitcoin).toContainText("-16.67%");
  await expect(ethereum).toContainText("-$1,000.00");
  await expect(holdingsTotals).toContainText("-$1,500.00");
  await expect(holdingsTotals).toContainText("-16.67%");
  await expect(unrealizedPnl.locator("dd").first()).toHaveText("-$1,500.00");
  await expect(unrealizedPnl.locator("dd").nth(1)).toHaveText("-16.67%");
  await expect(unrealizedPnl.locator("dd").first()).toHaveClass(/text-negative/);
  await expect(realizedPnl.locator("dd").first()).toHaveText("+$98.00");
  expect(runtime.portfolioRequestCount()).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("portfolio-live-tickers-desktop.png"),
    fullPage: true,
  });
});

test("keeps live unrealized profit and loss readable on small mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockPortfolioRuntime(page);
  await page.goto("/portfolio");

  const holdings = page.getByRole("region", { name: "Holdings", exact: true });
  const cards = holdings.getByRole("list", { name: "Holdings cards", exact: true });
  const bitcoin = cards.locator(":scope > li").filter({ hasText: "BTC" });
  await expect(bitcoin).toContainText("+$377.12");
  await expect(bitcoin).toContainText("+12.57%");
  const realizedPnl = page
    .getByRole("region", { name: "Portfolio summary", exact: true })
    .locator("dl > div")
    .filter({ has: page.locator('summary[aria-label="About Realized P&L"]') });
  await expect(realizedPnl.locator("dd").first()).toHaveText("+$98.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("portfolio-live-pnl-small-mobile.png"),
    fullPage: true,
  });
});

test("releases the portfolio ticker subscription when leaving the route", async ({ page }) => {
  const runtime = await mockPortfolioRuntime(page);
  await page.goto("/portfolio");
  await expect(page.locator('[data-live-price="BTC-USD"]').filter({ visible: true })).toContainText(
    "$67,542.31",
  );

  await page.getByRole("link", { name: "Markets", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(() => runtime.commands.some((command) => command.action === "unsubscribe"))
    .toBe(true);
  const unsubscribe = runtime.commands.find((command) => command.action === "unsubscribe");
  expect(unsubscribe).toMatchObject({
    channels: ["ticker"],
    symbols: ["BTC-USD", "ETH-USD"],
  });
});
