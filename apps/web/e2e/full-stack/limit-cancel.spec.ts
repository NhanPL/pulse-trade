import type { Page } from "@playwright/test";
import {
  cancelOrderResponseSchema,
  limitBuyOrderResponseSchema,
  loginResponseSchema,
  ordersListResponseSchema,
  portfolioResponseSchema,
  registerResponseSchema,
} from "@pulse-trade/contracts";

import { expect, test } from "./fixtures";

const apiURL = "http://127.0.0.1:3111/api/v1";

function waitForAPI(page: Page, path: string, method = "GET") {
  return page.waitForResponse(
    (response) => response.url() === `${apiURL}${path}` && response.request().method() === method,
  );
}

function waitForOrders(page: Page, status?: "PENDING") {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      `${url.origin}${url.pathname}` === `${apiURL}/orders` &&
      response.request().method() === "GET" &&
      url.searchParams.get("status") === (status ?? null)
    );
  });
}

async function expectCash(page: Page, available: string, locked: string) {
  const balances = page.getByRole("region", { name: "Cash balances", exact: true });
  for (const [label, amount] of [
    ["USD Available", available],
    ["USD Locked", locked],
    ["Total (USD)", "$10,000.00"],
  ]) {
    const metric = balances.locator("dl > div").filter({
      has: page.locator(`summary[aria-label="About ${label}"]`),
    });
    await expect(metric.locator("dd")).toContainText(amount);
  }
}

for (const layout of ["desktop", "mobile"] as const) {
  test(`${layout} LIMIT BUY locks USD, cancellation releases it and survives reload`, async ({
    page,
    request,
    paperAccount,
  }) => {
    // Real registration seeds a fresh account; no browser REST/WS or database services are mocked.
    const password = "O05-paper-trading-password";
    const registration = await request.post(`${apiURL}/auth/register`, {
      data: { email: paperAccount.email, password },
    });
    expect(registration.status()).toBe(201);
    const user = registerResponseSchema.parse(await registration.json()).data.user;
    const fundedBalances = [{ asset: "USD", available: "10000", locked: "0" }];
    expect(await paperAccount.readState()).toEqual({
      userId: user.id,
      sessions: 0,
      balances: fundedBalances,
      positions: [],
      orders: [],
      trades: [],
    });

    if (layout === "mobile") await page.setViewportSize({ width: 320, height: 800 });
    async function navigateTo(name: "Orders" | "Portfolio") {
      if (layout === "mobile")
        await page.getByRole("button", { name: "Open navigation menu" }).click();
      await page.getByRole("link", { name, exact: true }).click();
    }
    const browserErrors: string[] = [];
    let creates = 0;
    let cancellations = 0;
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      if (request.url() === `${apiURL}/orders`) creates++;
      if (request.url().startsWith(`${apiURL}/orders/`) && request.url().endsWith("/cancel"))
        cancellations++;
    });

    await page.goto("/login?returnTo=%2Ftrade%2FBTC-USD");
    await page.getByLabel("Email", { exact: true }).fill(paperAccount.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const loginResponse = waitForAPI(page, "/auth/login", "POST");
    const fundedPortfolioResponse = waitForAPI(page, "/portfolio");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    const login = await loginResponse;
    expect(login.status()).toBe(200);
    // Assert only public identity, never access/refresh credentials in failure output.
    expect(loginResponseSchema.parse(await login.json()).data.user).toEqual(user);
    await expect(page).toHaveURL("/trade/BTC-USD");
    expect((await fundedPortfolioResponse).status()).toBe(200);
    await expect(page.getByRole("tab", { name: "LIMIT", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "BUY", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Below the fixed $50,000 ticker: evaluator remains real, but this BUY cannot fill.
    await page.getByRole("spinbutton", { name: /^Limit price/ }).fill("40000");
    await page.getByRole("spinbutton", { name: /^Quantity/ }).fill("0.02");
    const createResponse = waitForAPI(page, "/orders", "POST");
    const reservedPortfolioResponse = waitForAPI(page, "/portfolio");
    await page.getByRole("button", { name: "Buy BTC", exact: true }).click();
    const creation = await createResponse;
    expect(creation.status()).toBe(201);
    expect(creation.request().postDataJSON()).toEqual({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: "0.02",
      limitPrice: "40000",
    });
    const order = limitBuyOrderResponseSchema.parse(await creation.json()).data;
    expect(order).toEqual({
      id: expect.any(String),
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      status: "PENDING",
      quantity: "0.02",
      limitPrice: "40000",
    });
    await expect(
      page.getByText("Limit buy order placed at $40,000.00 USD.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: /^Quantity/ })).toHaveValue("");

    const reservedBalances = [{ asset: "USD", available: "9200", locked: "800" }];
    const reservedPortfolio = await reservedPortfolioResponse;
    expect(reservedPortfolio.status()).toBe(200);
    expect(portfolioResponseSchema.parse(await reservedPortfolio.json()).data).toEqual({
      quoteCurrency: "USD",
      cash: { available: "9200", locked: "800" },
      balances: reservedBalances,
      positions: [],
    });
    const pendingState = {
      userId: user.id,
      sessions: 1,
      balances: reservedBalances,
      positions: [],
      orders: [
        {
          id: order.id,
          symbol: "BTC-USD",
          side: "BUY",
          type: "LIMIT",
          status: "PENDING",
          quantity: "0.02",
          filledQuantity: "0",
          avgFillPrice: null,
        },
      ],
      trades: [],
    };
    const reservation = {
      limitPrice: "40000",
      reservedAsset: "USD",
      reservedAmount: "800",
      cancelledAt: null,
      filledAt: null,
    };
    expect(await paperAccount.readState()).toEqual(pendingState);
    expect(await paperAccount.readReservation(order.id)).toEqual(reservation);
    await navigateTo("Portfolio");
    await expectCash(page, "$9,200.00", "$800.00");

    const openOrdersResponse = waitForOrders(page, "PENDING");
    await navigateTo("Orders");
    const openOrders = await openOrdersResponse;
    expect(openOrders.status()).toBe(200);
    const pendingList = ordersListResponseSchema.parse(await openOrders.json()).data;
    expect(pendingList.items).toHaveLength(1);
    const listedOrder = pendingList.items[0];
    expect(listedOrder).toEqual({
      ...order,
      filledQuantity: "0",
      avgFillPrice: null,
      createdAt: expect.any(String),
      cancelledAt: null,
      filledAt: null,
    });
    const openView =
      layout === "mobile"
        ? page.getByRole("list", { name: "Open orders cards" })
        : page.getByRole("table", { name: "Open orders table" });
    await expect(openView).toBeVisible();
    await expect(openView).toContainText("Pending");
    await expect(openView).toContainText("$40,000.00");
    const cancel = page.getByRole("button", { name: "Cancel BTC-USD BUY order", exact: true });
    await cancel.click();
    const dialog = page.getByRole("dialog", { name: "Cancel Order", exact: true });
    await expect(dialog).toContainText("Reserved funds will be released.");
    await expect(dialog).toContainText("0.02 BTC");
    await expect(dialog).toContainText("$40,000.00");
    await dialog.getByRole("button", { name: "No, Keep Order", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(cancellations).toBe(0);
    expect(await paperAccount.readState()).toEqual(pendingState);

    await cancel.click();
    const cancelResponse = waitForAPI(page, `/orders/${order.id}/cancel`, "POST");
    const clearedOpenOrdersResponse = waitForOrders(page, "PENDING");
    await dialog.getByRole("button", { name: "Yes, Cancel Order", exact: true }).focus();
    await page.keyboard.press("Enter");
    const cancellation = await cancelResponse;
    expect(cancellation.status()).toBe(200);
    const cancelledOrder = cancelOrderResponseSchema.parse(await cancellation.json()).data;
    expect(cancelledOrder).toEqual({
      id: order.id,
      status: "CANCELLED",
      cancelledAt: expect.any(String),
    });
    const clearedOpenOrders = await clearedOpenOrdersResponse;
    expect(clearedOpenOrders.status()).toBe(200);
    expect(ordersListResponseSchema.parse(await clearedOpenOrders.json()).data).toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("BTC-USD BUY order cancelled. Reserved funds released.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "You have no open orders." })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Open Orders", exact: true })).toBeFocused();

    const historyResponse = waitForOrders(page);
    await page.getByRole("tab", { name: "History", exact: true }).click();
    const history = await historyResponse;
    expect(history.status()).toBe(200);
    const expectedHistory = {
      items: [{ ...listedOrder, ...cancelledOrder }],
      nextCursor: null,
    };
    expect(ordersListResponseSchema.parse(await history.json()).data).toEqual(expectedHistory);
    const historyView =
      layout === "mobile"
        ? page.getByRole("list", { name: "Order history cards" })
        : page.getByRole("table", { name: "Order history table" });
    await expect(historyView).toBeVisible();
    await expect(historyView).toContainText("Cancelled");
    await expect(cancel).toHaveCount(0);

    // Inactive portfolio queries refetch on navigation after cancellation invalidates the cache.
    const releasedPortfolioResponse = waitForAPI(page, "/portfolio");
    await navigateTo("Portfolio");
    const releasedPortfolio = await releasedPortfolioResponse;
    expect(releasedPortfolio.status()).toBe(200);
    const expectedPortfolio = {
      quoteCurrency: "USD",
      cash: { available: "10000", locked: "0" },
      balances: fundedBalances,
      positions: [],
    };
    expect(portfolioResponseSchema.parse(await releasedPortfolio.json()).data).toEqual(
      expectedPortfolio,
    );
    await expectCash(page, "$10,000.00", "$0.00");

    const refreshResponse = waitForAPI(page, "/auth/refresh", "POST");
    const persistedPortfolioResponse = waitForAPI(page, "/portfolio");
    await page.reload();
    expect((await refreshResponse).status()).toBe(200);
    const persistedPortfolio = await persistedPortfolioResponse;
    expect(persistedPortfolio.status()).toBe(200);
    expect(portfolioResponseSchema.parse(await persistedPortfolio.json()).data).toEqual(
      expectedPortfolio,
    );
    await expectCash(page, "$10,000.00", "$0.00");
    await navigateTo("Orders");
    await expect(page.getByRole("heading", { name: "You have no open orders." })).toBeVisible();
    const persistedHistoryResponse = waitForOrders(page);
    await page.getByRole("tab", { name: "History", exact: true }).click();
    const persistedHistory = await persistedHistoryResponse;
    expect(persistedHistory.status()).toBe(200);
    expect(ordersListResponseSchema.parse(await persistedHistory.json()).data).toEqual(
      expectedHistory,
    );
    await expect(historyView).toContainText("Cancelled");
    await expect(cancel).toHaveCount(0);

    expect(await paperAccount.readState()).toEqual({
      ...pendingState,
      balances: fundedBalances,
      orders: pendingState.orders.map((order) => ({ ...order, status: "CANCELLED" })),
    });
    // Reservation metadata is retained for audit; only wallet locks are consumed/released.
    expect(await paperAccount.readReservation(order.id)).toEqual({
      ...reservation,
      cancelledAt: cancelledOrder.cancelledAt,
    });
    expect(creates).toBe(1);
    expect(cancellations).toBe(1);
    expect(browserErrors).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
