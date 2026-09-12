import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "user@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-bootstrap-access-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: { id: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2099-01-01T00:00:00.000Z" },
  },
};

async function fillLoginForm(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("user@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
}

async function authenticatedBootstrap(
  page: Page,
  refreshCalls: { count: number },
  meCalls: { count: number },
) {
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls.count++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
      headers: {
        "set-cookie":
          "pulse_trade_refresh=rotated-bootstrap-cookie; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
      },
    });
  });
  await page.route("**/me", async (route) => {
    meCalls.count++;
    expect((await route.request().allHeaders()).authorization).toBe(
      "Bearer synthetic-bootstrap-access-token",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    });
  });
}

test("bootstraps an HttpOnly refresh session on load and again after reload", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "pulse_trade_refresh",
      value: "existing-bootstrap-cookie",
      domain: "localhost",
      path: "/api/v1/auth",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const refreshCalls = { count: 0 };
  const meCalls = { count: 0 };
  await authenticatedBootstrap(page, refreshCalls, meCalls);

  await page.goto("/");
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
  await expect.poll(() => refreshCalls.count).toBe(1);
  expect(meCalls.count).toBe(1);
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "pulse_trade_refresh")?.httpOnly,
  ).toBe(true);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  await expect(page.locator("body")).not.toContainText("synthetic-bootstrap-access-token");

  await page.reload();
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
  await expect.poll(() => refreshCalls.count).toBe(2);
  expect(meCalls.count).toBe(2);
});

test("refreshes an in-memory access token before it expires without concurrent calls", async ({
  page,
}) => {
  let refreshCalls = 0;
  let meCalls = 0;
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls++;
    const response =
      refreshCalls === 1 ? { ...session, data: { ...session.data, expiresIn: 1 } } : session;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page.route("**/me", async (route) => {
    meCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
  await expect.poll(() => refreshCalls, { timeout: 5_000 }).toBe(2);
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
  expect(meCalls).toBe(2);
});

test("login waits for an in-flight bootstrap refresh before creating a new session", async ({
  page,
}) => {
  let releaseRefresh: () => void = () => {};
  const refreshPending = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshCalls = 0;
  let loginCalls = 0;
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls++;
    await refreshPending;
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await page.route("**/auth/login", async (route) => {
    loginCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });

  await page.goto("/login");
  await expect.poll(() => refreshCalls).toBe(1);
  await fillLoginForm(page);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  expect(loginCalls).toBe(0);
  releaseRefresh();
  await expect.poll(() => loginCalls).toBe(1);
  await expect(page).toHaveURL("http://localhost:3100/");
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
});

test("protected paths wait for bootstrap and redirect guests with a safe return route", async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/refresh", async (route) => {
    await pending;
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });

  await page.goto("/orders?status=PENDING");
  await expect(page.getByRole("heading", { name: "Checking your session" })).toBeVisible();
  release();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Forders%3Fstatus%3DPENDING$/);

  for (const path of ["/portfolio", "/watchlist?sort=name"]) {
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?returnTo=${encodeURIComponent(path).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`,
      ),
    );
  }
});

test("a missing, expired or revoked session never calls me and cannot expose a private page", async ({
  page,
}) => {
  let refreshCalls = 0;
  let meCalls = 0;
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls++;
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await page.route("**/me", async (route) => {
    meCalls++;
    await route.abort();
  });
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fportfolio$/);
  expect(refreshCalls).toBe(1);
  expect(meCalls).toBe(0);
  await expect(page.locator("body")).not.toContainText("raw server message");
});

test("a refresh followed by rejected current-user verification returns guests to login", async ({
  page,
}) => {
  let meCalls = 0;
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }),
  );
  await page.route("**/me", async (route) => {
    meCalls++;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "sensitive session detail" } }),
    });
  });
  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwatchlist$/);
  expect(meCalls).toBe(1);
  await expect(page.locator("body")).not.toContainText("sensitive session detail");
});

test("an unavailable bootstrap protects private content, never retries itself, and provides an explicit retry", async ({
  page,
}) => {
  let refreshCalls = 0;
  let meCalls = 0;
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls++;
    if (refreshCalls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "internal detail" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
  await page.route("**/me", async (route) => {
    meCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    });
  });
  await page.goto("/orders");
  await expect(
    page.getByRole("heading", { name: "We couldn't verify your session" }),
  ).toBeVisible();
  await page.waitForTimeout(100);
  expect(refreshCalls).toBe(1);
  await expect(page.locator("body")).not.toContainText("internal detail");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("user@example.com", { exact: true })).toBeVisible();
  await expect.poll(() => refreshCalls).toBe(2);
  expect(meCalls).toBe(1);
  await expect(page).toHaveURL(/\/orders$/);
});

test("protected-session error stays readable on mobile without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/portfolio");
  await expect(
    page.getByRole("heading", { name: "We couldn't verify your session" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("protected-session-mobile.png"),
    fullPage: true,
  });
});

test("malformed or identity-mismatched bootstrap payloads fail closed", async ({ page }) => {
  const badUser = { id: "123e4567-e89b-42d3-a456-426614174099", email: "different@example.com" };
  let refreshCalls = 0;
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
  await page.route("**/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user: badUser } }),
    }),
  );
  await page.goto("/portfolio");
  await expect(
    page.getByRole("heading", { name: "We couldn't verify your session" }),
  ).toBeVisible();
  await expect(page.getByText("user@example.com", { exact: true })).toHaveCount(0);
  expect(refreshCalls).toBe(1);
});

test("public market pages remain available while bootstrap reports an unavailable API", async ({
  page,
}) => {
  await page.route("**/auth/refresh", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Market Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
});
