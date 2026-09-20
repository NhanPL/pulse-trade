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

async function mockAuthenticatedSession(page: Page): Promise<void> {
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
}

async function openMarketOrderForm(page: Page): Promise<void> {
  await page.goto("/trade/BTC-USD");
  await page.getByText("MARKET", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Buy BTC", exact: true })).toBeVisible();
}

function quantityInput(page: Page) {
  return page.getByRole("spinbutton", { name: /^Quantity/ });
}

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
