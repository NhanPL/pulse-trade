import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-portfolio-states-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: {
      id: "123e4567-e89b-42d3-a456-426614174001",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  },
};
const fundedPortfolio = {
  data: {
    cash: { available: "5000", locked: "0" },
    positions: [
      { asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" },
      { asset: "ETH", averageCost: "3000", quantity: "2", realizedPnl: "0" },
    ],
    quoteCurrency: "USD",
  },
};
const emptyPortfolio = {
  data: {
    cash: { available: "10000", locked: "0" },
    positions: [],
    quoteCurrency: "USD",
  },
};

type RealtimeCommand = {
  action: "subscribe" | "unsubscribe";
  channels: string[];
  symbols: string[];
};

async function mockAuthenticatedSession(page: Page): Promise<void> {
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
}

test("shows contextual portfolio skeletons while the account snapshot loads", async ({
  page,
}, testInfo) => {
  await mockAuthenticatedSession(page);
  let releasePortfolio: () => void = () => undefined;
  const portfolioPending = new Promise<void>((resolve) => {
    releasePortfolio = resolve;
  });
  await page.route("**/api/v1/portfolio", async (route) => {
    await portfolioPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPortfolio),
    });
  });

  await page.goto("/portfolio");
  const loading = page.getByRole("status", { name: "Portfolio loading", exact: true });
  await expect(loading).toBeVisible();
  await expect(loading.getByRole("region", { name: "Loading portfolio summary" })).toBeVisible();
  await expect(loading.getByRole("region", { name: "Loading cash balances" })).toBeVisible();
  await expect(loading.getByRole("region", { name: "Loading holdings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Portfolio summary", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("portfolio-loading-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("portfolio-loading-small-mobile.png"),
    fullPage: true,
  });

  releasePortfolio();
  await expect(loading).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Portfolio summary", exact: true })).toBeVisible();
});

test("offers a useful cash-only empty state on small mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAuthenticatedSession(page);
  await page.route("**/api/v1/portfolio", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPortfolio),
    }),
  );

  await page.goto("/portfolio");
  const holdings = page.getByRole("region", { name: "Holdings", exact: true });
  await expect(holdings.getByRole("heading", { name: "No crypto positions yet" })).toBeVisible();
  await expect(
    holdings.getByText("Start paper trading to build your portfolio.", { exact: true }),
  ).toBeVisible();
  await expect(holdings.getByRole("link", { name: "Explore Markets" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(holdings.getByRole("searchbox", { name: "Search holdings" })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Portfolio valuation status" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("portfolio-empty-small-mobile.png"),
    fullPage: true,
  });
});

test("marks partial and stale valuation without discarding last-known prices", async ({
  page,
}, testInfo) => {
  await mockAuthenticatedSession(page);
  let socket: WebSocketRoute | undefined;
  let eventTimestamp = 100;

  function sendEvent(event: Record<string, unknown>): void {
    if (!socket) throw new Error("Portfolio WebSocket has not connected");
    socket.send(JSON.stringify(event));
  }

  function sendTicker(symbol: string, price: string): void {
    eventTimestamp += 1;
    sendEvent({
      v: 1,
      event: "ticker.update",
      ts: eventTimestamp,
      symbol,
      data: {
        price,
        change24hPercent: "1.25",
        high24h: price,
        low24h: price,
        volume24h: "1000",
        marketTs: eventTimestamp,
      },
    });
  }

  await page.routeWebSocket(/\/realtime$/, (webSocket) => {
    socket = webSocket;
    webSocket.onMessage((message) => {
      const command = JSON.parse(message.toString()) as RealtimeCommand;
      if (command.action === "subscribe" && command.symbols.includes("BTC-USD")) {
        sendTicker("BTC-USD", "67500");
      }
    });
  });
  await page.route("**/api/v1/portfolio", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fundedPortfolio),
    }),
  );

  await page.goto("/portfolio");
  const valuationStatus = page.getByRole("status", {
    name: "Portfolio valuation status",
    exact: true,
  });
  await expect(
    valuationStatus.getByRole("heading", { name: "Waiting for live prices" }),
  ).toBeVisible();
  await expect(valuationStatus).toContainText("ETH prices have not arrived yet");
  const summary = page.getByRole("region", { name: "Portfolio summary", exact: true });
  await expect(summary).toHaveAttribute("data-valuation-status", "waiting");

  sendTicker("ETH-USD", "3500");
  await expect(valuationStatus).toHaveCount(0);
  await expect(summary).toHaveAttribute("data-valuation-status", "live");
  const holdings = page.getByRole("region", { name: "Holdings", exact: true });
  const table = holdings.getByRole("table", { name: "Holdings table", exact: true });
  const bitcoin = table.getByRole("row", { name: /BTC Bitcoin/ });
  const ethereum = table.getByRole("row", { name: /ETH Ethereum/ });
  await expect(bitcoin).toContainText("$67,500.00");

  eventTimestamp += 1;
  sendEvent({
    v: 1,
    event: "market.stale",
    ts: eventTimestamp,
    symbol: "BTC-USD",
    data: { reason: "UPSTREAM_DISCONNECTED", lastUpdateTs: eventTimestamp - 1 },
  });
  await expect(valuationStatus.getByRole("heading", { name: "Valuation delayed" })).toBeVisible();
  await expect(valuationStatus).toContainText("BTC market data is delayed");
  await expect(summary).toHaveAttribute("data-valuation-status", "delayed");
  await expect(summary).toContainText("Includes delayed prices · USD");
  await expect(bitcoin.getByText("Delayed", { exact: true })).toBeVisible();
  await expect(bitcoin).toContainText("$67,500.00");
  await expect(ethereum.getByText("Delayed", { exact: true })).toHaveCount(0);
  await expect(holdings.locator("footer").getByText("Delayed", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("portfolio-stale-valuation-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  const cards = holdings.getByRole("list", { name: "Holdings cards", exact: true });
  const bitcoinCard = cards.locator(":scope > li").filter({ hasText: "BTC" });
  await expect(bitcoinCard.getByText("Delayed", { exact: true })).toBeVisible();
  await expect(bitcoinCard).toContainText("$67,500.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("portfolio-stale-valuation-small-mobile.png"),
    fullPage: true,
  });

  eventTimestamp += 1;
  sendEvent({
    v: 1,
    event: "market.live",
    ts: eventTimestamp,
    symbol: "BTC-USD",
    data: {},
  });
  await expect(valuationStatus).toHaveCount(0);
  await expect(summary).toHaveAttribute("data-valuation-status", "live");
  await expect(bitcoinCard.getByText("Delayed", { exact: true })).toHaveCount(0);
});
