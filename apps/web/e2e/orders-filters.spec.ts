import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-order-filters-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: {
      id: "123e4567-e89b-42d3-a456-426614174001",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  },
};
const orders = [
  {
    avgFillPrice: null,
    cancelledAt: null,
    createdAt: "2026-09-29T04:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: "123e4567-e89b-42d3-a456-426614174030",
    limitPrice: "65000",
    quantity: "0.1",
    side: "BUY",
    status: "PENDING",
    symbol: "BTC-USD",
    type: "LIMIT",
  },
  {
    avgFillPrice: "67542.31",
    cancelledAt: null,
    createdAt: "2026-09-29T03:00:00.000Z",
    filledAt: "2026-09-29T03:00:01.000Z",
    filledQuantity: "0.25",
    id: "123e4567-e89b-42d3-a456-426614174031",
    limitPrice: null,
    quantity: "0.25",
    side: "BUY",
    status: "FILLED",
    symbol: "BTC-USD",
    type: "MARKET",
  },
  {
    avgFillPrice: null,
    cancelledAt: "2026-09-29T02:15:00.000Z",
    createdAt: "2026-09-29T02:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: "123e4567-e89b-42d3-a456-426614174032",
    limitPrice: "4000",
    quantity: "1.5",
    side: "SELL",
    status: "CANCELLED",
    symbol: "ETH-USD",
    type: "LIMIT",
  },
];

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

test("orders filters are server-backed, tab-aware, resettable, and responsive", async ({
  page,
}, testInfo) => {
  await mockAuthenticatedSession(page);
  const requests: URL[] = [];
  await page.route("**/api/v1/orders**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const symbol = url.searchParams.get("symbol");
    const side = url.searchParams.get("side");
    const status = url.searchParams.get("status");
    const filteredOrders = orders.filter(
      (order) =>
        (!symbol || order.symbol === symbol) &&
        (!side || order.side === side) &&
        (!status || order.status === status),
    );

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: filteredOrders, nextCursor: null } }),
    });
  });

  await page.goto("/orders");
  const filters = page.getByRole("region", { name: "Order filters" });
  const symbolFilter = filters.getByLabel("Symbol");
  const sideFilter = filters.getByLabel("Side");
  const statusFilter = filters.getByLabel("Status");
  await expect(filters).toBeVisible();
  await expect(statusFilter).toBeDisabled();
  await expect(statusFilter).toHaveValue("PENDING");

  await symbolFilter.selectOption("BTC-USD");
  await sideFilter.selectOption("BUY");
  await expect.poll(() => requests.at(-1)?.searchParams.get("symbol")).toBe("BTC-USD");
  await expect.poll(() => requests.at(-1)?.searchParams.get("side")).toBe("BUY");
  await expect.poll(() => requests.at(-1)?.searchParams.get("status")).toBe("PENDING");

  await page.getByRole("tab", { name: "History" }).click();
  await expect(statusFilter).toBeEnabled();
  await expect.poll(() => requests.at(-1)?.searchParams.get("status")).toBeNull();
  await statusFilter.selectOption("FILLED");
  await expect.poll(() => requests.at(-1)?.searchParams.get("status")).toBe("FILLED");

  const historyTable = page.getByRole("table", { name: "Order history table" });
  await expect(historyTable.locator("tbody > tr")).toHaveCount(1);
  await expect(historyTable.locator("tbody > tr").first()).toContainText("BTC / USD");
  await expect(historyTable.locator("tbody > tr").first()).toContainText("Filled");

  await symbolFilter.selectOption("ETH-USD");
  await expect(page.getByRole("heading", { name: "No orders match these filters." })).toBeVisible();

  await filters.getByRole("button", { name: "Reset filters" }).click();
  await expect(symbolFilter).toHaveValue("");
  await expect(sideFilter).toHaveValue("");
  await expect(statusFilter).toHaveValue("");
  await expect.poll(() => requests.at(-1)?.searchParams.get("symbol")).toBeNull();
  await expect.poll(() => requests.at(-1)?.searchParams.get("side")).toBeNull();
  await expect.poll(() => requests.at(-1)?.searchParams.get("status")).toBeNull();
  await expect(historyTable.locator("tbody > tr")).toHaveCount(3);

  await page.screenshot({ path: testInfo.outputPath("order-filters-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(filters).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("order-filters-mobile.png"), fullPage: true });
});
