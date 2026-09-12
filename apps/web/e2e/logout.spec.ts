import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "user@example.com" };

function createSession(expiresIn = 900) {
  return {
    data: {
      user,
      accessToken: "synthetic-logout-access-token",
      tokenType: "Bearer",
      expiresIn,
      session: {
        id: "123e4567-e89b-42d3-a456-426614174001",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    },
  };
}

async function authenticatePage(page: Page, expiresIn = 900) {
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createSession(expiresIn)),
    }),
  );
  await page.route("**/me", async (route) => {
    expect((await route.request().allHeaders()).authorization).toBe(
      "Bearer synthetic-logout-access-token",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    });
  });
}

test("revokes with the current bearer and redirects a protected route to sign in", async ({
  page,
}) => {
  let logoutCalls = 0;
  await authenticatePage(page);
  await page.route("**/auth/logout", async (route) => {
    logoutCalls += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    expect((await route.request().allHeaders()).authorization).toBe(
      "Bearer synthetic-logout-access-token",
    );
    await route.fulfill({ status: 204, headers: { "cache-control": "no-store" } });
  });

  await page.goto("/portfolio");
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();

  await expect.poll(() => logoutCalls).toBe(1);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fportfolio$/);
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("keeps the current UI session and private cache eligible for retry when logout fails", async ({
  page,
}) => {
  let logoutCalls = 0;
  await authenticatePage(page);
  await page.route("**/auth/logout", async (route) => {
    logoutCalls += 1;
    await route.fulfill({ status: logoutCalls === 1 ? 503 : 204 });
  });

  await page.goto("/");
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();

  await expect(
    page.getByText("Sign-out is temporarily unavailable. Please try again shortly."),
  ).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();

  await expect.poll(() => logoutCalls).toBe(2);
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
});

test("waits for an in-flight refresh before logging out", async ({ page }) => {
  let releaseRefresh: () => void = () => {};
  const refreshPending = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshCalls = 0;
  let logoutCalls = 0;
  await page.route("**/auth/refresh", async (route) => {
    refreshCalls += 1;
    if (refreshCalls === 2) await refreshPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createSession(refreshCalls === 1 ? 1 : 900)),
    });
  });
  await page.route("**/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    }),
  );
  await page.route("**/auth/logout", async (route) => {
    logoutCalls += 1;
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await expect.poll(() => refreshCalls, { timeout: 5_000 }).toBe(2);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Signing out…", exact: true })).toBeDisabled();
  expect(logoutCalls).toBe(0);

  releaseRefresh();
  await expect.poll(() => logoutCalls).toBe(1);
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  expect(refreshCalls).toBe(2);
});

test("offers a keyboard-accessible logout action in the mobile navigation", async ({ page }) => {
  let logoutCalls = 0;
  await page.setViewportSize({ width: 360, height: 800 });
  await authenticatePage(page);
  await page.route("**/auth/logout", async (route) => {
    logoutCalls += 1;
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).press("Enter");

  await expect.poll(() => logoutCalls).toBe(1);
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
