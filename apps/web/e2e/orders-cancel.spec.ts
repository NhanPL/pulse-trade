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

for (const layout of ["desktop", "mobile"] as const) {
  test(`${layout} cancel requires confirmation, prevents duplicate submits and refreshes persisted order state`, async ({
    page,
  }, testInfo) => {
    await authenticate(page);
    if (layout === "mobile") await page.setViewportSize({ width: 320, height: 800 });
    async function navigateTo(name: "Orders" | "Portfolio"): Promise<void> {
      if (layout === "mobile")
        await page.getByRole("button", { name: "Open navigation menu" }).click();
      await page.getByRole("link", { name, exact: true }).click();
    }
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
    await navigateTo("Orders");
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
    await page.screenshot({ path: testInfo.outputPath(`cancel-dialog-${layout}.png`) });
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
    const history =
      layout === "mobile"
        ? page.getByRole("list", { name: "Order history cards" })
        : page.getByRole("table", { name: "Order history table" });
    await expect(history).toContainText("Cancelled");
    await expect(page.getByRole("button", { name: "Cancel BTC-USD BUY order" })).toHaveCount(0);
    await navigateTo("Portfolio");
    await expect(balances).toContainText("$10,000.00");
    await expect(balances).toContainText("$0.00");
    expect(portfolioRequests).toBeGreaterThanOrEqual(2);
    await navigateTo("Orders");
    await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "History" }).click();
    await expect(history).toContainText("Cancelled");
  });
}

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

for (const outcome of ["FILLED", "CANCELLED", "NOT_FOUND"] as const) {
  test(`cancellation race with ${outcome} refreshes orders and authoritative balances without retrying`, async ({
    page,
  }, testInfo) => {
    await authenticate(page);
    let raced = false;
    let posts = 0;
    let refreshedLists = 0;
    let portfolioRequests = 0;
    await page.route("**/api/v1/portfolio**", (route) => {
      portfolioRequests++;
      const available = raced && outcome !== "FILLED" ? "10000" : "3500";
      const locked = raced ? "0" : "6500";
      const filled = raced && outcome === "FILLED";
      return route.fulfill({
        json: {
          data: {
            balances: [
              { asset: "USD", available, locked },
              ...(filled ? [{ asset: "BTC", available: "0.1", locked: "0" }] : []),
            ],
            cash: { available, locked },
            positions: filled
              ? [{ asset: "BTC", quantity: "0.1", averageCost: "65000", realizedPnl: "0" }]
              : [],
            quoteCurrency: "USD",
          },
        },
      });
    });
    await page.route("**/api/v1/orders**", (route) => {
      if (route.request().method() === "POST") {
        posts++;
        raced = true;
        return route.fulfill({
          status: outcome === "NOT_FOUND" ? 404 : 409,
          json: {
            error: {
              code: outcome === "NOT_FOUND" ? "ORDER_NOT_FOUND" : "ORDER_NOT_CANCELLABLE",
              message: "database secret",
            },
          },
        });
      }
      if (raced) refreshedLists++;
      const onlyPending = new URL(route.request().url()).searchParams.get("status") === "PENDING";
      const order = {
        ...pendingOrder,
        status: raced ? outcome : "PENDING",
        filledQuantity: raced && outcome === "FILLED" ? "0.1" : "0",
        avgFillPrice: raced && outcome === "FILLED" ? "65000" : null,
        filledAt: raced && outcome === "FILLED" ? "2026-10-02T01:00:00.000Z" : null,
        cancelledAt: raced && outcome === "CANCELLED" ? "2026-10-02T01:00:00.000Z" : null,
      };
      return route.fulfill({
        json: {
          data: {
            items: raced && (onlyPending || outcome === "NOT_FOUND") ? [] : [order],
            nextCursor: null,
          },
        },
      });
    });

    await page.goto("/portfolio");
    const balances = page.getByRole("region", { name: "Cash balances", exact: true });
    await expect(balances).toContainText("$6,500.00");
    const initialPortfolioRequests = portfolioRequests;
    await page.getByRole("link", { name: "Orders", exact: true }).click();
    // Cover an already mounted History query as well as the infinite Open Orders query.
    if (outcome === "FILLED") await page.getByRole("tab", { name: "History" }).click();
    await page.getByRole("button", { name: "Cancel BTC-USD BUY order" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel Order", exact: true });
    await dialog.getByRole("button", { name: "Yes, Cancel Order" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      outcome === "NOT_FOUND" ? "no longer available" : "no longer pending",
    );
    await expect(dialog.getByRole("alert")).not.toContainText("database secret");
    await expect(dialog).not.toContainText("Reserved funds will be released.");
    await expect(dialog.getByRole("button", { name: "Yes, Cancel Order" })).toHaveCount(0);
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeFocused();
    expect(posts).toBe(1);
    await expect.poll(() => refreshedLists).toBeGreaterThan(0);
    if (outcome === "FILLED") {
      await expect(page.getByRole("table", { name: "Order history table" })).toContainText(
        "Filled",
      );
    } else {
      await expect(page.getByRole("heading", { name: "You have no open orders." })).toBeVisible();
    }
    if (outcome === "CANCELLED") await page.setViewportSize({ width: 320, height: 800 });
    await page.screenshot({ path: testInfo.outputPath(`cancel-conflict-${outcome}.png`) });
    if (outcome === "CANCELLED") {
      expect((await dialog.boundingBox())?.width).toBeLessThanOrEqual(320);
    }
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("tab", {
        name: outcome === "FILLED" ? "History" : "Open Orders",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByText("BTC-USD BUY order cancelled. Reserved funds released."),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel BTC-USD BUY order" })).toHaveCount(0);
    if (outcome === "CANCELLED") await page.setViewportSize({ width: 1586, height: 992 });
    if (outcome !== "FILLED") await page.getByRole("tab", { name: "History" }).click();
    if (outcome !== "NOT_FOUND") {
      await expect(page.getByRole("table", { name: "Order history table" })).toContainText(
        outcome === "FILLED" ? "Filled" : "Cancelled",
      );
    }
    await page.getByRole("link", { name: "Portfolio", exact: true }).click();
    await expect(balances).toContainText(outcome === "FILLED" ? "$3,500.00" : "$10,000.00");
    await expect(balances).toContainText("$0.00");
    await expect(balances).not.toContainText("$6,500.00");
    if (outcome === "FILLED") await expect(balances).not.toContainText("$10,000.00");
    expect(portfolioRequests).toBeGreaterThan(initialPortfolioRequests);
    expect(posts).toBe(1);
  });
}

test("a conflict stays terminal and dismissible even when the orders refresh fails", async ({
  page,
}) => {
  await authenticate(page);
  let posts = 0;
  let failedRefreshes = 0;
  await page.route("**/api/v1/orders**", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({
        status: 409,
        json: { error: { code: "ORDER_NOT_CANCELLABLE" } },
      });
    }
    if (posts > 0) {
      failedRefreshes++;
      return route.fulfill({ status: 503, json: { error: { code: "ORDERS_UNAVAILABLE" } } });
    }
    return route.fulfill({ json: { data: { items: [pendingOrder], nextCursor: null } } });
  });
  await page.goto("/orders");
  await page.getByRole("button", { name: "Cancel BTC-USD BUY order" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel Order", exact: true });
  await dialog.getByRole("button", { name: "Yes, Cancel Order" }).click();
  await expect(dialog.getByRole("alert")).toContainText("no longer pending");
  await expect(dialog.getByRole("button", { name: "Yes, Cancel Order" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await expect.poll(() => failedRefreshes).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(posts).toBe(1);
});
