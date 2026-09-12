import { expect, test, type Page } from "@playwright/test";
import { safeReturnTo } from "../src/features/auth/model/return-to";

const loginResponse = {
  data: {
    user: { id: "123e4567-e89b-42d3-a456-426614174000", email: "user@example.com" },
    accessToken: "synthetic-test-access-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: { id: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2099-01-01T00:00:00.000Z" },
  },
};

async function fillForm(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill(" User@Example.com ");
  await page.getByLabel("Password", { exact: true }).fill(" test-password ");
}

test("return destinations allow product routes but reject external URLs and auth loops", () => {
  for (const value of [
    undefined,
    ["/orders", "/watchlist"],
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/login",
    "/register",
    "/%2f%2fevil.example",
    "/trade/../login",
    "/orders\n",
    "/orders\0",
    "/api/v1/auth/logout",
  ]) {
    expect(safeReturnTo(value)).toBe("/");
  }
  for (const value of [
    "/",
    "/trade/BTC-USD",
    "/trade/ETH-USD?interval=5m#chart",
    "/portfolio",
    "/orders?status=PENDING",
    "/watchlist",
  ]) {
    expect(safeReturnTo(value)).toBe(value);
  }
});

test("desktop login follows the auth design and validates with keyboard access", async ({
  page,
}, testInfo) => {
  let requests = 0;
  await page.route("**/auth/login", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("login-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Enter your password (1–128 characters).")).toBeVisible();
  await fillForm(page);
  await page.getByRole("button", { name: "Show password" }).press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("Password", { exact: true }).fill("p".repeat(129));
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByText("Enter your password (1–128 characters).")).toBeVisible();
  expect(requests).toBe(0);
});

test("mobile login and registration notice fit without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/login?registered=1");
  await expect(page.getByRole("status")).toContainText("Account created.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sign In", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("login-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test("login sends credentials once with cookies, preserves password bytes and returns to trading", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "pulse_trade_refresh",
      value: "synthetic-existing-cookie",
      domain: "localhost",
      path: "/api/v1/auth",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  let requests = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/login", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      email: "user@example.com",
      password: " test-password ",
    });
    expect((await route.request().allHeaders()).cookie).toContain(
      "pulse_trade_refresh=synthetic-existing-cookie",
    );
    await pending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(loginResponse),
      headers: {
        "set-cookie":
          "pulse_trade_refresh=synthetic-new-cookie; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
      },
    });
  });
  await page.goto("/login?returnTo=%2Ftrade%2FBTC-USD");
  await fillForm(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(page).toHaveURL(/\/trade\/BTC-USD$/);
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find((item) => item.name === "pulse_trade_refresh");
  expect(cookie?.value).toBe("synthetic-new-cookie");
  expect(cookie?.httpOnly).toBe(true);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  await expect(page.locator("body")).not.toContainText("synthetic-test-access-token");
});

test("invalid credentials and recoverable failures have safe messages and preserve inputs", async ({
  page,
}) => {
  const failures = [
    { status: 401, message: "Email or password is incorrect." },
    { status: 401, message: "Email or password is incorrect." },
    { status: 400, message: "Enter a valid email and a password" },
    { status: 403, message: "Sign-in is not available from this site." },
    { status: 429, message: "Too many sign-in attempts." },
    { status: 503, message: "Sign-in is temporarily unavailable." },
    { status: 0, message: "Check your connection" },
    { status: 200, message: "We couldn't confirm sign-in." },
  ];
  let attempt = 0;
  await page.route("**/auth/login", async (route) => {
    const failure = failures[attempt++];
    if (failure.status === 0) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: failure.status,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: attempt === 1 ? "USER_NOT_FOUND" : "WRONG_PASSWORD",
          message: "sensitive account detail",
        },
      }),
    });
  });
  await page.goto("/login");
  await fillForm(page);
  for (const failure of failures) {
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(failure.message);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(" test-password ");
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
    await expect(page.locator("body")).not.toContainText("sensitive account detail");
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("successful login falls back to markets for an external returnTo", async ({ page }) => {
  await page.route("**/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(loginResponse),
    }),
  );
  await page.goto("/login?returnTo=https%3A%2F%2Fevil.example");
  await fillForm(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
});

test("leaving login during a request does not apply a late successful session", async ({
  page,
}) => {
  let received = false;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/login", async (route) => {
    received = true;
    await pending;
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(loginResponse),
      })
      .catch(() => {});
  });
  await page.goto("/login");
  await fillForm(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect.poll(() => received).toBe(true);
  const aborted = page.waitForEvent("requestfailed", (request) =>
    request.url().endsWith("/auth/login"),
  );
  await page.getByRole("link", { name: "Markets", exact: true }).click();
  await aborted;
  await expect(page).toHaveURL("http://localhost:3100/");
  release();
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByText("user@example.com", { exact: true })).toHaveCount(0);
});

test("registration success leads to login with a success notice", async ({ page }) => {
  await page.route("**/auth/register", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { user: loginResponse.data.user } }),
    }),
  );
  await page.goto("/register");
  await fillForm(page);
  await page.getByLabel("Confirm password", { exact: true }).fill(" test-password ");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByRole("status")).toContainText("Account created.");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("a stalled login times out without retrying automatically", async ({ page }) => {
  let requests = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/login", async (route) => {
    requests++;
    await pending;
    await route.abort().catch(() => {});
  });
  await page.goto("/login");
  await fillForm(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Check your connection", {
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
  expect(requests).toBe(1);
  release();
});
