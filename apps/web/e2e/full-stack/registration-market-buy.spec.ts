import type { Page } from "@playwright/test";
import {
  loginResponseSchema,
  marketOrderResponseSchema,
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

test("register, sign in, buy BTC at market and retain the funded portfolio after reload", async ({
  page,
  context,
  paperAccount,
}) => {
  // No REST or WebSocket routes are intercepted: browser -> Nest -> PostgreSQL is real.
  const password = "O04-paper-trading-password";
  const browserErrors: string[] = [];
  let buyRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url() === `${apiURL}/orders` && request.method() === "POST") buyRequests++;
  });

  await page.goto("/register");
  await expect(page.getByText("$10,000 virtual USD", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(paperAccount.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  const registrationResponse = waitForAPI(page, "/auth/register", "POST");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  const registration = await registrationResponse;
  expect(registration.status()).toBe(201);
  const user = registerResponseSchema.parse(await registration.json()).data.user;
  expect(user.email).toBe(paperAccount.email);
  await expect(page.getByRole("heading", { name: "Your account is ready" })).toBeVisible();

  expect(await paperAccount.readState()).toEqual({
    userId: user.id,
    sessions: 0,
    balances: [{ asset: "USD", available: "10000", locked: "0" }],
    positions: [],
    orders: [],
    trades: [],
  });

  // Registration intentionally does not create a session; exercise the documented login step.
  const signInLink = page.getByRole("link", { name: "Continue to sign in →", exact: true });
  await expect(signInLink).toHaveAttribute("href", "/login?registered=1");
  await signInLink.click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await page.getByLabel("Email", { exact: true }).fill(paperAccount.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const loginResponse = waitForAPI(page, "/auth/login", "POST");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const login = await loginResponse;
  expect(login.status()).toBe(200);
  expect(loginResponseSchema.parse(await login.json()).data.user).toEqual(user);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
  const refreshCookies = (await context.cookies()).filter(
    (cookie) => cookie.name === "pulse_trade_refresh",
  );
  // Assert metadata only so CI failures never print raw cookie credentials.
  expect(refreshCookies.length).toBe(1);
  expect(refreshCookies[0]?.httpOnly).toBe(true);
  expect(refreshCookies[0]?.path).toBe("/api/v1/auth");

  const fundedPortfolioResponse = waitForAPI(page, "/portfolio");
  await page.goto("/trade/BTC-USD");
  const fundedPortfolio = await fundedPortfolioResponse;
  expect(fundedPortfolio.status()).toBe(200);
  expect(portfolioResponseSchema.parse(await fundedPortfolio.json()).data).toEqual({
    quoteCurrency: "USD",
    cash: { available: "10000", locked: "0" },
    balances: [{ asset: "USD", available: "10000", locked: "0" }],
    positions: [],
  });
  await page
    .getByRole("tablist", { name: "Order type" })
    .getByRole("tab", { name: "MARKET", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "BUY", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("spinbutton", { name: /^Quantity/ }).fill("0.01");
  const buyResponse = waitForAPI(page, "/orders", "POST");
  const refreshedPortfolioResponse = waitForAPI(page, "/portfolio");
  await page.getByRole("button", { name: "Buy BTC", exact: true }).click();
  const buy = await buyResponse;
  expect(buy.status()).toBe(201);
  expect(buy.request().postDataJSON()).toEqual({
    symbol: "BTC-USD",
    side: "BUY",
    type: "MARKET",
    quantity: "0.01",
  });
  const order = marketOrderResponseSchema.parse(await buy.json()).data;
  expect(order).toEqual({
    id: expect.any(String),
    symbol: "BTC-USD",
    side: "BUY",
    type: "MARKET",
    status: "FILLED",
    quantity: "0.01",
    avgFillPrice: "50000",
  });
  await expect(
    page.getByText("Market buy order filled at $50,000.00 USD.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /^Quantity/ })).toHaveValue("");

  const expectedPortfolio = {
    quoteCurrency: "USD",
    cash: { available: "9500", locked: "0" },
    balances: [
      { asset: "BTC", available: "0.01", locked: "0" },
      { asset: "USD", available: "9500", locked: "0" },
    ],
    positions: [{ asset: "BTC", quantity: "0.01", averageCost: "50000", realizedPnl: "0" }],
  };
  const refreshedPortfolio = await refreshedPortfolioResponse;
  expect(refreshedPortfolio.status()).toBe(200);
  expect(portfolioResponseSchema.parse(await refreshedPortfolio.json()).data).toEqual(
    expectedPortfolio,
  );

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Portfolio", exact: true })
    .click();
  await expect(page).toHaveURL("/portfolio");
  const holdings = page.getByRole("table", { name: "Holdings table", exact: true });
  const btc = holdings.getByRole("row", { name: /BTC Bitcoin/ });
  await expect(holdings.locator("tbody > tr")).toHaveCount(1);
  await expect(btc.getByRole("cell").nth(0)).toContainText("0.010000");
  await expect(btc.getByRole("cell").nth(1)).toHaveText("$50,000.00");
  await expect(btc.locator('[data-live-price="BTC-USD"]')).toContainText("$50,000.00");
  await expect(btc.getByRole("cell").nth(3)).toContainText("$500.00");
  await expect(btc.getByRole("cell").nth(4)).toContainText("$0.00");
  const availableCash = page
    .getByRole("region", { name: "Cash balances" })
    .locator("dl > div")
    .filter({
      has: page.locator('summary[aria-label="About USD Available"]'),
    });
  await expect(availableCash.locator("dd")).toContainText("$9,500.00");
  const totalValue = page
    .getByRole("region", { name: "Portfolio summary" })
    .locator("dl > div")
    .filter({
      has: page.locator('summary[aria-label="About Total Value"]'),
    });
  await expect(totalValue.locator("dd").first()).toHaveText("$10,000.00");

  const cookieBeforeReload = (await context.cookies()).find(
    (cookie) => cookie.name === "pulse_trade_refresh",
  );
  const refreshResponse = waitForAPI(page, "/auth/refresh", "POST");
  const meResponse = waitForAPI(page, "/me");
  const persistedPortfolioResponse = waitForAPI(page, "/portfolio");
  await page.reload();
  expect((await refreshResponse).status()).toBe(200);
  expect((await meResponse).status()).toBe(200);
  const persistedPortfolio = await persistedPortfolioResponse;
  expect(persistedPortfolio.status()).toBe(200);
  expect(portfolioResponseSchema.parse(await persistedPortfolio.json()).data).toEqual(
    expectedPortfolio,
  );
  await expect(page).toHaveURL("/portfolio");
  await expect(btc).toContainText("0.010000");
  await expect(totalValue.locator("dd").first()).toHaveText("$10,000.00");
  const cookieAfterReload = (await context.cookies()).find(
    (cookie) => cookie.name === "pulse_trade_refresh",
  );
  // Compare in memory without printing credentials in an assertion failure.
  expect(
    Boolean(
      cookieBeforeReload &&
      cookieAfterReload &&
      cookieBeforeReload.value !== cookieAfterReload.value,
    ),
  ).toBe(true);

  expect(await paperAccount.readState()).toEqual({
    userId: user.id,
    sessions: 1,
    balances: expectedPortfolio.balances,
    positions: expectedPortfolio.positions,
    orders: [{ ...order, filledQuantity: "0.01" }],
    trades: [
      { orderId: order.id, side: "BUY", quantity: "0.01", price: "50000", quoteAmount: "500" },
    ],
  });
  expect(buyRequests).toBe(1);
  expect(browserErrors).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});
