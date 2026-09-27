import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-open-orders-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: {
      id: "123e4567-e89b-42d3-a456-426614174001",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  },
};
const orderIds = [
  "123e4567-e89b-42d3-a456-426614174010",
  "123e4567-e89b-42d3-a456-426614174011",
  "123e4567-e89b-42d3-a456-426614174012",
];
const orders = [
  {
    avgFillPrice: null,
    cancelledAt: null,
    createdAt: "2026-09-27T04:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: orderIds[0],
    limitPrice: "60000",
    quantity: "0.25",
    side: "BUY",
    status: "PENDING",
    symbol: "BTC-USD",
    type: "LIMIT",
  },
  {
    avgFillPrice: null,
    cancelledAt: null,
    createdAt: "2026-09-27T03:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: orderIds[1],
    limitPrice: "3500",
    quantity: "1.5",
    side: "SELL",
    status: "PENDING",
    symbol: "ETH-USD",
    type: "LIMIT",
  },
  {
    avgFillPrice: null,
    cancelledAt: null,
    createdAt: "2026-09-27T02:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: orderIds[2],
    limitPrice: "125",
    quantity: "5",
    side: "BUY",
    status: "PENDING",
    symbol: "SOL-USD",
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

test("open orders render account data and load the next cursor page", async ({
  page,
}, testInfo) => {
  await mockAuthenticatedSession(page);
  const requests: { authorization: string | undefined; url: URL }[] = [];
  await page.route("**/api/v1/orders**", (route) => {
    const url = new URL(route.request().url());
    requests.push({
      authorization: route.request().headers()["authorization"],
      url,
    });
    const isNextPage = url.searchParams.get("cursor") === orderIds[1];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: isNextPage ? [orders[2]] : orders.slice(0, 2),
          nextCursor: isNextPage ? null : orderIds[1],
        },
      }),
    });
  });

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  const table = page.getByRole("table", { name: "Open orders table", exact: true });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody > tr")).toHaveCount(2);
  const bitcoin = table.getByRole("row", { name: /Open BTC-USD trading workspace/ });
  await expect(bitcoin).toContainText("BUY");
  await expect(bitcoin).toContainText("LIMIT");
  await expect(bitcoin).toContainText("0.25");
  await expect(bitcoin).toContainText("$60,000.00");
  await expect(bitcoin).toContainText("Pending");
  await expect(
    bitcoin.getByRole("link", { name: "Open BTC-USD trading workspace" }),
  ).toHaveAttribute("href", "/trade/BTC-USD");
  expect(requests[0]?.authorization).toBe("Bearer synthetic-open-orders-token");
  expect(requests[0]?.url.searchParams.get("status")).toBe("PENDING");
  expect(requests[0]?.url.searchParams.get("limit")).toBe("20");

  await page.getByRole("button", { name: "Load more orders" }).click();
  await expect(table.locator("tbody > tr")).toHaveCount(3);
  await expect(table.getByRole("row", { name: /Open SOL-USD trading workspace/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more orders" })).toHaveCount(0);
  expect(requests[1]?.url.searchParams.get("cursor")).toBe(orderIds[1]);

  await page.screenshot({ path: testInfo.outputPath("open-orders-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("open-orders-small-mobile.png"),
    fullPage: true,
  });
});

test("open orders show contextual loading and empty states", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockAuthenticatedSession(page);
  let releaseOrders: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    releaseOrders = resolve;
  });
  await page.route("**/api/v1/orders**", async (route) => {
    await pending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [], nextCursor: null } }),
    });
  });

  await page.goto("/orders");
  await expect(
    page.getByRole("status", { name: "Open orders loading", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  releaseOrders();
  await expect(page.getByRole("heading", { name: "You have no open orders." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse markets" })).toHaveAttribute("href", "/");
  await page.screenshot({
    path: testInfo.outputPath("open-orders-empty-mobile.png"),
    fullPage: true,
  });
});
