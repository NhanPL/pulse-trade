import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-order-history-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: {
      id: "123e4567-e89b-42d3-a456-426614174001",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  },
};
const orderIds = [
  "123e4567-e89b-42d3-a456-426614174020",
  "123e4567-e89b-42d3-a456-426614174021",
  "123e4567-e89b-42d3-a456-426614174022",
];
const orders = [
  {
    avgFillPrice: "67542.31",
    cancelledAt: null,
    createdAt: "2026-09-28T04:00:00.000Z",
    filledAt: "2026-09-28T04:00:01.000Z",
    filledQuantity: "0.25",
    id: orderIds[0],
    limitPrice: null,
    quantity: "0.25",
    side: "BUY",
    status: "FILLED",
    symbol: "BTC-USD",
    type: "MARKET",
  },
  {
    avgFillPrice: null,
    cancelledAt: "2026-09-28T03:15:00.000Z",
    createdAt: "2026-09-28T03:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: orderIds[1],
    limitPrice: "4000",
    quantity: "1.5",
    side: "SELL",
    status: "CANCELLED",
    symbol: "ETH-USD",
    type: "LIMIT",
  },
  {
    avgFillPrice: null,
    cancelledAt: null,
    createdAt: "2026-09-28T02:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: orderIds[2],
    limitPrice: "125",
    quantity: "5",
    side: "BUY",
    status: "REJECTED",
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

test("history shows complete order details newest first and pages without accumulating rows", async ({
  page,
}, testInfo) => {
  await mockAuthenticatedSession(page);
  const historyRequests: { authorization: string | undefined; url: URL }[] = [];
  await page.route("**/api/v1/orders**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("status") === "PENDING") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { items: [], nextCursor: null } }),
      });
    }

    historyRequests.push({
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
  await expect(page.getByRole("tab", { name: "Open Orders" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "History" }).click();

  const table = page.getByRole("table", { name: "Order history table", exact: true });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody > tr")).toHaveCount(2);
  await expect(table.locator("tbody > tr").first()).toContainText("BTC / USD");

  const bitcoin = table.getByRole("row", { name: /Open BTC-USD trading workspace/ });
  await expect(bitcoin).toContainText("BUY");
  await expect(bitcoin).toContainText("MARKET");
  await expect(bitcoin).toContainText("$67,542.31");
  await expect(bitcoin).toContainText("Filled");
  await expect(bitcoin.locator("time").nth(1)).toHaveAttribute(
    "datetime",
    "2026-09-28T04:00:01.000Z",
  );

  const ethereum = table.getByRole("row", { name: /Open ETH-USD trading workspace/ });
  await expect(ethereum).toContainText("SELL");
  await expect(ethereum).toContainText("LIMIT");
  await expect(ethereum).toContainText("$4,000.00");
  await expect(ethereum).toContainText("Cancelled");
  await expect(ethereum.locator("time").nth(1)).toHaveAttribute(
    "datetime",
    "2026-09-28T03:15:00.000Z",
  );

  expect(historyRequests[0]?.authorization).toBe("Bearer synthetic-order-history-token");
  expect(historyRequests[0]?.url.searchParams.get("status")).toBeNull();
  expect(historyRequests[0]?.url.searchParams.get("limit")).toBe("20");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(table.locator("tbody > tr")).toHaveCount(1);
  await expect(table.getByRole("row", { name: /Open SOL-USD trading workspace/ })).toContainText(
    "Rejected",
  );
  expect(historyRequests[1]?.url.searchParams.get("cursor")).toBe(orderIds[1]);
  await expect(page.getByText("Page 2", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(table.locator("tbody > tr")).toHaveCount(2);
  await expect(table.locator("tbody > tr").first()).toContainText("BTC / USD");

  await page.screenshot({ path: testInfo.outputPath("order-history-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(table).toBeHidden();
  const cards = page.getByRole("list", { name: "Order history cards", exact: true });
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  const bitcoinCard = cards.getByRole("listitem", { name: "BTC-USD BUY MARKET order" });
  await expect(bitcoinCard).toContainText("$67,542.31");
  await expect(bitcoinCard).toContainText("Filled");
  await expect(bitcoinCard.locator("time").nth(1)).toHaveAttribute(
    "datetime",
    "2026-09-28T04:00:01.000Z",
  );
  const ethereumCard = cards.getByRole("listitem", { name: "ETH-USD SELL LIMIT order" });
  await expect(ethereumCard).toContainText("$4,000.00");
  await expect(ethereumCard).toContainText("Cancelled");
  await expect(ethereumCard.locator("time").nth(1)).toHaveAttribute(
    "datetime",
    "2026-09-28T03:15:00.000Z",
  );
  await expect(cards.getByRole("button", { name: /Cancel .* order/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("order-history-small-mobile.png"),
    fullPage: true,
  });
});

test("history uses keyboard-accessible tabs and has contextual loading and empty states", async ({
  page,
}) => {
  await mockAuthenticatedSession(page);
  let releaseHistory: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route("**/api/v1/orders**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("status")) await pending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [], nextCursor: null } }),
    });
  });

  await page.goto("/orders");
  const openTab = page.getByRole("tab", { name: "Open Orders" });
  await openTab.focus();
  await openTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("status", { name: "Order history loading" })).toBeVisible();

  releaseHistory();
  await expect(
    page.getByRole("heading", { name: "You haven't placed any orders yet." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse markets" })).toHaveAttribute("href", "/");
});
