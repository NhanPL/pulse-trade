import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-cancel-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: { id: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2099-01-01T00:00:00.000Z" },
  },
};
const pendingOrder = {
  id: "123e4567-e89b-42d3-a456-426614174040",
  symbol: "BTC-USD",
  side: "BUY",
  type: "LIMIT",
  status: "PENDING",
  quantity: "0.1",
  filledQuantity: "0",
  limitPrice: "65000",
  avgFillPrice: null,
  createdAt: "2026-10-02T00:00:00.000Z",
  filledAt: null,
  cancelledAt: null,
};

async function authenticate(page: Page) {
  await page.route("**/auth/refresh", (route) => route.fulfill({ json: session }));
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: { data: { user } } }));
}

test("cancel requires confirmation, prevents duplicate submits and refreshes persisted order state", async ({
  page,
}, testInfo) => {
  await authenticate(page);
  let cancelled = false;
  let portfolioRequests = 0;
  let posts = 0;
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/portfolio**", (route) => {
    portfolioRequests++;
    const available = cancelled ? "10000" : "3500";
    const locked = cancelled ? "0" : "6500";
    return route.fulfill({
      json: {
        data: {
          balances: [{ asset: "USD", available, locked }],
          cash: { available, locked },
          positions: [],
          quoteCurrency: "USD",
        },
      },
    });
  });
  await page.route("**/api/v1/orders**", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      expect(route.request().url()).toContain(`/orders/${pendingOrder.id}/cancel`);
      expect(route.request().headers()["authorization"]).toBe("Bearer synthetic-cancel-token");
      await pending;
      cancelled = true;
      return route.fulfill({
        json: {
          data: {
            id: pendingOrder.id,
            status: "CANCELLED",
            cancelledAt: "2026-10-02T01:00:00.000Z",
          },
        },
      });
    }
    const url = new URL(route.request().url());
    const order = cancelled
      ? { ...pendingOrder, status: "CANCELLED", cancelledAt: "2026-10-02T01:00:00.000Z" }
      : pendingOrder;
    return route.fulfill({
      json: {
        data: {
          items: cancelled && url.searchParams.get("status") === "PENDING" ? [] : [order],
          nextCursor: null,
        },
      },
    });
  });

  await page.goto("/portfolio");
  const balances = page.getByRole("region", { name: "Cash balances", exact: true });
  await expect(balances).toContainText("$6,500.00");
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  const cancel = page.getByRole("button", { name: "Cancel BTC-USD BUY order" });
  await cancel.click();
  const dialog = page.getByRole("dialog", { name: "Cancel Order", exact: true });
  await expect(dialog).toContainText("Reserved funds will be released.");
  await expect(dialog).toContainText("$65,000.00");
  await dialog.getByRole("button", { name: "No, Keep Order" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cancel).toBeFocused();
  expect(posts).toBe(0);
  await cancel.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(posts).toBe(0);

  await cancel.click();
  await page.screenshot({ path: testInfo.outputPath("cancel-dialog-desktop.png") });
  await dialog.getByRole("button", { name: "Yes, Cancel Order" }).dblclick();
  await expect(dialog.getByRole("button", { name: "Cancelling…" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "No, Keep Order" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(posts).toBe(1);
  release();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("BTC-USD BUY order cancelled. Reserved funds released."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "You have no open orders." })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Open Orders" })).toBeFocused();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("table", { name: "Order history table" })).toContainText("Cancelled");
  await expect(page.getByRole("button", { name: "Cancel BTC-USD BUY order" })).toHaveCount(0);
  await page.getByRole("link", { name: "Portfolio", exact: true }).click();
  await expect(balances).toContainText("$10,000.00");
  await expect(balances).toContainText("$0.00");
  expect(portfolioRequests).toBeGreaterThanOrEqual(2);
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("table", { name: "Order history table" })).toContainText("Cancelled");
});

test("History offers cancel only for pending limits and keeps API errors inside the mobile dialog", async ({
  page,
}, testInfo) => {
  await authenticate(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route("**/api/v1/orders**", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 503,
        json: { error: { code: "ORDER_UNAVAILABLE", message: "database secret" } },
      });
    }
    return route.fulfill({
      json: {
        data: {
          items: [
            { ...pendingOrder, side: "SELL" },
            {
              ...pendingOrder,
              id: "123e4567-e89b-42d3-a456-426614174041",
              type: "MARKET",
              status: "FILLED",
              limitPrice: null,
              avgFillPrice: "67542",
              filledAt: "2026-10-02T00:00:01.000Z",
            },
          ],
          nextCursor: null,
        },
      },
    });
  });
  await page.goto("/orders");
  await page.getByRole("tab", { name: "History" }).click();
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("PENDING");
  const cancel = page.getByRole("button", { name: "Cancel BTC-USD SELL order" });
  await expect(cancel).toHaveCount(1);
  await cancel.click();
  const dialog = page.getByRole("dialog", { name: "Cancel Order", exact: true });
  await expect(dialog).toContainText("Reserved assets will be released.");
  await dialog.getByRole("button", { name: "Yes, Cancel Order" }).click();
  await expect(dialog.getByRole("alert")).toContainText("We couldn't cancel this order.");
  await expect(dialog.getByRole("alert")).not.toContainText("database secret");
  await expect(dialog.getByRole("button", { name: "Yes, Cancel Order" })).toBeEnabled();
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("cancel-dialog-mobile-error.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
