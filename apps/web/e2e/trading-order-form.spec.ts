import { expect, test, type Page } from "@playwright/test";

const user = {
  email: "user@example.com",
  id: "123e4567-e89b-42d3-a456-426614174000",
};
const session = {
  data: {
    user,
    accessToken: "synthetic-order-form-access-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: {
      expiresAt: "2099-01-01T00:00:00.000Z",
      id: "123e4567-e89b-42d3-a456-426614174001",
    },
  },
};

async function mockAuthenticatedSession(page: Page) {
  await page.route("**/auth/refresh", async (route) => {
    await route.fulfill({
      body: JSON.stringify(session),
      contentType: "application/json",
      headers: {
        "set-cookie":
          "pulse_trade_refresh=rotated-order-form-cookie; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
      },
      status: 200,
    });
  });
  await page.route("**/api/v1/me", async (route) => {
    expect((await route.request().allHeaders()).authorization).toBe(
      "Bearer synthetic-order-form-access-token",
    );
    await route.fulfill({
      body: JSON.stringify({ data: { user } }),
      contentType: "application/json",
      status: 200,
    });
  });
}

test("authenticated traders submit one MARKET order and receive filled feedback", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      domain: "localhost",
      httpOnly: true,
      name: "pulse_trade_refresh",
      path: "/api/v1/auth",
      sameSite: "Lax",
      value: "existing-order-form-cookie",
    },
  ]);
  await mockAuthenticatedSession(page);

  let requests = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/orders", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(
      "Bearer synthetic-order-form-access-token",
    );
    expect(route.request().postDataJSON()).toEqual({
      quantity: "0.01",
      side: "BUY",
      symbol: "BTC-USD",
      type: "MARKET",
    });
    await pending;
    await route.fulfill({
      body: JSON.stringify({
        data: {
          avgFillPrice: "67542.31",
          id: "123e4567-e89b-42d3-a456-426614174002",
          quantity: "0.01",
          side: "BUY",
          status: "FILLED",
          symbol: "BTC-USD",
          type: "MARKET",
        },
      }),
      contentType: "application/json",
      status: 201,
    });
  });

  await page.goto("/trade/BTC-USD");
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByText("MARKET", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Buy BTC", exact: true })).toBeVisible();
  await page.getByLabel("Quantity", { exact: true }).fill("0.01");

  const submit = page.getByRole("button", { name: "Buy BTC", exact: true });
  await submit.click();
  await expect(page.getByRole("button", { name: "Buying…", exact: true })).toBeDisabled();
  await page.getByLabel("Quantity", { exact: true }).press("Enter");
  expect(requests).toBe(1);

  release();
  await expect(
    page.getByText("Market BUY order filled at $67,542.31 USD.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("guests are directed to sign in before a MARKET order is submitted", async ({ page }) => {
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ contentType: "application/json", status: 401, body: "{}" }),
  );
  await page.goto("/trade/BTC-USD");
  await page.getByText("MARKET", { exact: true }).click();
  await page.getByRole("button", { name: "Sign in to buy BTC", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Ftrade%2FBTC-USD$/);
});

test("mobile MARKET controls remain reachable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ contentType: "application/json", status: 401, body: "{}" }),
  );

  await page.goto("/trade/BTC-USD");
  await page.getByText("MARKET", { exact: true }).click();
  const submit = page.getByRole("button", { name: "Sign in to buy BTC", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
