import { expect, test, type Page } from "@playwright/test";
import type { OrderListItem } from "@pulse-trade/contracts";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const pendingOrder: OrderListItem = {
  id: "123e4567-e89b-42d3-a456-426614174050",
  symbol: "BTC-USD",
  side: "BUY",
  type: "LIMIT",
  status: "PENDING",
  quantity: "123456789012345678.123456789012345678",
  filledQuantity: "0",
  limitPrice: "60000",
  avgFillPrice: null,
  createdAt: "2026-10-02T04:00:00.000Z",
  filledAt: null,
  cancelledAt: null,
};
const sellOrder: OrderListItem = {
  ...pendingOrder,
  id: "123e4567-e89b-42d3-a456-426614174051",
  symbol: "ETH-USD",
  side: "SELL",
  quantity: "1.5",
  limitPrice: "3500",
  createdAt: "2026-10-02T03:00:00.000Z",
};
const filledOrder = {
  ...pendingOrder,
  type: "MARKET",
  status: "FILLED",
  quantity: "0.25",
  filledQuantity: "0.25",
  limitPrice: null,
  avgFillPrice: "67542.31",
  filledAt: "2026-10-02T04:00:01.000Z",
} satisfies OrderListItem;
const rejectedOrder: OrderListItem = {
  ...pendingOrder,
  id: "123e4567-e89b-42d3-a456-426614174052",
  symbol: "SOL-USD",
  status: "REJECTED",
  quantity: "5",
  limitPrice: "125",
  createdAt: "2026-10-02T02:00:00.000Z",
};

async function authenticate(page: Page): Promise<void> {
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({
      json: {
        data: {
          user,
          accessToken: "synthetic-mobile-orders-token",
          tokenType: "Bearer",
          expiresIn: 900,
          session: {
            id: "123e4567-e89b-42d3-a456-426614174001",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        },
      },
    }),
  );
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: { data: { user } } }));
}

test("mobile cards retain precise values, shared queries, pagination and filters across breakpoints", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await authenticate(page);
  const requests: URL[] = [];
  await page.route("**/api/v1/orders**", (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers()["authorization"]).toBe("Bearer synthetic-mobile-orders-token");
    const url = new URL(route.request().url());
    requests.push(url);
    expect(url.searchParams.get("limit")).toBe("20");
    const source =
      url.searchParams.get("status") === "PENDING"
        ? [pendingOrder, sellOrder]
        : [filledOrder, sellOrder, rejectedOrder];
    const filtered = source.filter((order) =>
      (["symbol", "side", "status"] as const).every(
        (key) => !url.searchParams.has(key) || url.searchParams.get(key) === order[key],
      ),
    );
    const cursor = url.searchParams.get("cursor");
    const index = cursor ? filtered.findIndex((order) => order.id === cursor) + 1 : 0;
    const order = filtered[index];
    return route.fulfill({
      json: {
        data: { items: order ? [order] : [], nextCursor: filtered[index + 1] ? order.id : null },
      },
    });
  });

  await page.goto("/orders");
  const cards = page.getByRole("list", { name: "Open orders cards", exact: true });
  const bitcoin = cards.getByRole("listitem", { name: "BTC-USD BUY LIMIT order" });
  await expect(bitcoin).toContainText(`${pendingOrder.quantity} BTC`);
  await expect(bitcoin).toContainText("$60,000.00");
  await expect(bitcoin).toContainText("Pending");
  await expect(bitcoin.locator("time")).toHaveAttribute("datetime", pendingOrder.createdAt);
  // The complete decimal stays readable; clipping or an internal horizontal scroller is not enough.
  expect(await bitcoin.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect(
    await bitcoin
      .locator("dd")
      .first()
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await bitcoin.getByRole("link", { name: "Open BTC-USD trading workspace" }).focus();
  await page.keyboard.press("Tab");
  const cancel = bitcoin.getByRole("button", { name: "Cancel BTC-USD BUY order" });
  await expect(cancel).toBeFocused();
  expect((await cancel.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  for (const width of [768, 320]) {
    await page.getByRole("button", { name: "Cancel BTC-USD BUY order" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel Order", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${pendingOrder.quantity} BTC`);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width, height: 800 });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Open Orders" })).toBeFocused();
  }

  await page.getByRole("button", { name: "Load more orders" }).click();
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  await expect(cards.getByRole("listitem").nth(1)).toContainText("SELL");
  expect(requests[1].searchParams.get("cursor")).toBe(pendingOrder.id);
  const requestCount = requests.length;
  for (const width of [390, 767, 768, 1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const isMobile = width < 768;
    await expect(page.getByRole("list", { name: "Open orders cards" })).toHaveCount(
      isMobile ? 1 : 0,
    );
    await expect(page.getByRole("table", { name: "Open orders table" })).toHaveCount(
      isMobile ? 0 : 1,
    );
    await expect(page.getByRole("button", { name: "Cancel BTC-USD BUY order" })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(requests).toHaveLength(requestCount);
  await page.screenshot({
    path: testInfo.outputPath("order-cards-precise-mobile.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "History" }).click();
  const history = page.getByRole("list", { name: "Order history cards", exact: true });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("Filled");
  await expect(history).toContainText("$67,542.31");
  await expect(history.getByRole("button", { name: /Cancel .* order/ })).toHaveCount(0);
  await expect(history.locator("time").nth(1)).toHaveAttribute("datetime", filledOrder.filledAt);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history.getByRole("button", { name: "Cancel ETH-USD SELL order" })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("Rejected");
  await expect(history.getByRole("button", { name: /Cancel .* order/ })).toHaveCount(0);
  await expect(history.locator("time")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(history).toContainText("ETH / USD");

  await page.getByRole("combobox", { name: "Symbol", exact: true }).selectOption("SOL-USD");
  await expect(history).toContainText("SOL / USD");
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Side", exact: true }).selectOption("SELL");
  await expect(page.getByRole("heading", { name: "No orders match these filters." })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(history).toContainText("BTC / USD");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("PENDING");
  await expect(history).toContainText("Pending");
  await expect(history.getByRole("button", { name: "Cancel BTC-USD BUY order" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const view of ["open", "history"] as const) {
  test(`mobile ${view} loading, sanitized error and retry-to-empty stay readable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await authenticate(page);
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let recovered = false;
    await page.route("**/api/v1/orders**", async (route) => {
      if (
        view === "history" &&
        new URL(route.request().url()).searchParams.get("status") === "PENDING"
      ) {
        return route.fulfill({ json: { data: { items: [], nextCursor: null } } });
      }
      await pending;
      return recovered
        ? route.fulfill({ json: { data: { items: [], nextCursor: null } } })
        : route.fulfill({
            status: 503,
            json: { error: { code: "ORDERS_UNAVAILABLE", message: "database secret" } },
          });
    });

    await page.goto("/orders");
    if (view === "history") await page.getByRole("tab", { name: "History" }).click();
    await expect(
      page.getByRole("status", {
        name: view === "open" ? "Open orders loading" : "Order history loading",
      }),
    ).toBeVisible();
    release();
    // Wait for the production query retry policy before asserting the terminal error state.
    await expect(
      page.getByRole("heading", {
        name: view === "open" ? "Open orders unavailable" : "Order history unavailable",
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page
        .getByRole("tabpanel", { name: view === "open" ? "Open Orders" : "History" })
        .getByRole("alert"),
    ).not.toContainText("database secret");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    recovered = true;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
      page.getByRole("heading", {
        name: view === "open" ? "You have no open orders." : "You haven't placed any orders yet.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse markets" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
