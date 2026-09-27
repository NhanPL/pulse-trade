import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-market-order-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: { id: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2099-01-01T00:00:00.000Z" },
  },
};
const portfolio = {
  data: {
    balances: [
      { asset: "BTC", available: "0.04", locked: "0.01" },
      { asset: "USD", available: "8500", locked: "1500" },
    ],
    cash: { available: "8500", locked: "1500" },
    positions: [{ asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "0" }],
    quoteCurrency: "USD",
  },
};

async function mockAuthenticatedSession(
  page: Page,
  getPortfolio: () => typeof portfolio = () => portfolio,
): Promise<void> {
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }),
  );
  await page.route("**/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    }),
  );
  await page.route("**/portfolio", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(getPortfolio()),
    }),
  );
}

async function openMarketOrderForm(page: Page): Promise<void> {
  await page.goto("/trade/BTC-USD");
  await page.getByText("MARKET", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Buy BTC", exact: true })).toBeVisible();
}

function quantityInput(page: Page) {
  return page.getByRole("spinbutton", { name: /^Quantity/ });
}

test("LIMIT and MARKET are keyboard-accessible order type tabs", async ({ page }) => {
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ contentType: "application/json", status: 401, body: "{}" }),
  );
  await page.goto("/trade/BTC-USD");

  const typeTabs = page.getByRole("tablist", { name: "Order type" });
  const limitTab = typeTabs.getByRole("tab", { name: "LIMIT", exact: true });
  const marketTab = typeTabs.getByRole("tab", { name: "MARKET", exact: true });

  await expect(limitTab).toHaveAttribute("aria-selected", "true");
  await expect(limitTab).toHaveAttribute("tabindex", "0");
  await expect(marketTab).toHaveAttribute("aria-selected", "false");
  await expect(marketTab).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("spinbutton", { name: /^Limit price/ })).toBeVisible();

  await limitTab.focus();
  await limitTab.press("ArrowRight");
  await expect(marketTab).toBeFocused();
  await expect(marketTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Indicative price", { exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /^Limit price/ })).toHaveCount(0);

  await marketTab.press("Home");
  await expect(limitTab).toBeFocused();
  await expect(limitTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("spinbutton", { name: /^Limit price/ })).toBeVisible();
});

test("LIMIT validates its price locally and submits a pending order", async ({ page }) => {
  await mockAuthenticatedSession(page);
  let requests = 0;
  await page.route("**/orders", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect((await route.request().allHeaders()).authorization).toBe(
      "Bearer synthetic-market-order-token",
    );
    expect(route.request().postDataJSON()).toEqual({
      limitPrice: "65000",
      quantity: "0.01",
      side: "BUY",
      symbol: "BTC-USD",
      type: "LIMIT",
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "123e4567-e89b-42d3-a456-426614174003",
          limitPrice: "65000",
          quantity: "0.01",
          side: "BUY",
          status: "PENDING",
          symbol: "BTC-USD",
          type: "LIMIT",
        },
      }),
    });
  });

  await page.goto("/trade/BTC-USD");
  const limitPrice = page.getByRole("spinbutton", { name: /^Limit price/ });
  const quantity = quantityInput(page);
  const submit = page.getByRole("button", { name: "Buy BTC", exact: true });

  await quantity.fill("0.01");
  await limitPrice.fill("0");
  await submit.click();
  await expect(limitPrice).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a positive limit price.", { exact: true })).toBeVisible();
  expect(requests).toBe(0);

  await limitPrice.fill("1.0000000000000000001");
  await submit.click();
  await expect(
    page.getByText("Use at most 20 whole-number digits and 18 decimal places.", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);

  await limitPrice.fill("65000");
  await submit.click();
  await expect(
    page.getByText("Limit buy order placed at $65,000.00 USD.", { exact: true }),
  ).toBeVisible();
  await expect(quantity).toHaveValue("");
  await expect(limitPrice).toHaveValue("65000");
  expect(requests).toBe(1);
});

test("order balance preview follows the side and refreshes after a confirmed order", async ({
  page,
}) => {
  let orderPlaced = false;
  let portfolioRequests = 0;
  await mockAuthenticatedSession(page, () => {
    portfolioRequests++;
    if (!orderPlaced) return portfolio;
    return {
      data: {
        ...portfolio.data,
        balances: [
          { asset: "BTC", available: "0.04", locked: "0.01" },
          { asset: "USD", available: "7850", locked: "2150" },
        ],
        cash: { available: "7850", locked: "2150" },
      },
    };
  });
  await page.route("**/orders", async (route) => {
    orderPlaced = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "123e4567-e89b-42d3-a456-426614174004",
          limitPrice: "65000",
          quantity: "0.01",
          side: "BUY",
          status: "PENDING",
          symbol: "BTC-USD",
          type: "LIMIT",
        },
      }),
    });
  });

  await page.goto("/trade/BTC-USD");
  let preview = page.getByRole("group", { name: "USD balance preview", exact: true });
  await expect(preview).toContainText("Available$8,500.00");
  await expect(preview).toContainText("Locked$1,500.00");

  await page.getByRole("tab", { name: "SELL", exact: true }).click();
  preview = page.getByRole("group", { name: "BTC balance preview", exact: true });
  await expect(preview).toContainText("Available0.04 BTC");
  await expect(preview).toContainText("Locked0.01 BTC");

  await page.getByRole("tab", { name: "BUY", exact: true }).click();
  await page.getByRole("spinbutton", { name: /^Limit price/ }).fill("65000");
  await quantityInput(page).fill("0.01");
  await page.getByRole("button", { name: "Buy BTC", exact: true }).click();
  preview = page.getByRole("group", { name: "USD balance preview", exact: true });
  await expect(preview).toContainText("Available$7,850.00");
  await expect(preview).toContainText("Locked$2,150.00");
  expect(portfolioRequests).toBeGreaterThanOrEqual(2);

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("authenticated market buy submits the shared request and confirms the fill", async ({
  page,
}) => {
  await mockAuthenticatedSession(page);
  let requests = 0;
  await page.route("**/orders", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect((await route.request().allHeaders()).authorization).toBe(
      "Bearer synthetic-market-order-token",
    );
    expect(route.request().postDataJSON()).toEqual({
      symbol: "BTC-USD",
      side: "BUY",
      type: "MARKET",
      quantity: "0.01",
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "123e4567-e89b-42d3-a456-426614174002",
          status: "FILLED",
          symbol: "BTC-USD",
          side: "BUY",
          type: "MARKET",
          quantity: "0.01",
          avgFillPrice: "67542.31",
        },
      }),
    });
  });

  await openMarketOrderForm(page);
  await quantityInput(page).fill("0.01");
  await page.getByRole("button", { name: "Buy BTC", exact: true }).click();

  await expect(
    page.getByText("Market buy order filled at $67,542.31 USD.", { exact: true }),
  ).toBeVisible();
  await expect(quantityInput(page)).toHaveValue("");
  expect(requests).toBe(1);
});

test("insufficient balance stays local to Quantity and preserves the order for correction", async ({
  page,
}) => {
  await mockAuthenticatedSession(page);
  await page.route("**/orders", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      symbol: "BTC-USD",
      side: "BUY",
      type: "MARKET",
      quantity: "1",
    });
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "INSUFFICIENT_BALANCE",
          message: "internal balance implementation detail",
          details: null,
        },
      }),
    });
  });

  await openMarketOrderForm(page);
  await quantityInput(page).fill("1");
  await page.getByRole("button", { name: "Buy BTC", exact: true }).click();

  await expect(quantityInput(page)).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Insufficient USD available to buy BTC. Reduce the quantity and try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(quantityInput(page)).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Buy BTC", exact: true })).toBeEnabled();
  await expect(page.locator("body")).not.toContainText("internal balance implementation detail");

  await quantityInput(page).fill("0.01");
  await expect(
    page.getByText("Insufficient USD available to buy BTC. Reduce the quantity and try again."),
  ).toHaveCount(0);
  await expect(quantityInput(page)).not.toHaveAttribute("aria-invalid", "true");
});

test("insufficient asset balance explains a market sell correction", async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.route("**/orders", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      symbol: "BTC-USD",
      side: "SELL",
      type: "MARKET",
      quantity: "1",
    });
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INSUFFICIENT_BALANCE", details: null } }),
    });
  });

  await openMarketOrderForm(page);
  await page.getByRole("tab", { name: "SELL", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sell BTC", exact: true })).toBeVisible();
  await quantityInput(page).fill("1");
  await page.getByRole("button", { name: "Sell BTC", exact: true }).click();

  await expect(
    page.getByText("Insufficient BTC available to sell BTC. Reduce the quantity and try again."),
  ).toBeVisible();
});
