import { expect, test, type Page } from "@playwright/test";
import type { WatchlistItem } from "@pulse-trade/contracts";

const firstUser = { id: "123e4567-e89b-42d3-a456-426614174000", email: "watch@example.com" };
const secondUser = { id: "123e4567-e89b-42d3-a456-426614174002", email: "other@example.com" };
const savedBtc: WatchlistItem = {
  id: "123e4567-e89b-42d3-a456-426614174010",
  symbol: "BTC-USD",
  createdAt: "2026-10-04T00:00:00.000Z",
};

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function mockApi(page: Page, initialItems: WatchlistItem[] = []) {
  const state = {
    user: firstUser,
    items: new Map<string, WatchlistItem[]>([
      [firstUser.id, initialItems],
      [secondUser.id, []],
    ]),
    reads: 0,
    adds: 0,
    removes: 0,
    readStatus: 200,
    addStatus: 200,
    removeStatus: 204,
    refreshStatus: 200,
    readGate: null as Promise<void> | null,
    addGate: null as Promise<void> | null,
  };
  function session() {
    return {
      data: {
        user: state.user,
        accessToken: `synthetic-watchlist-${state.user.id}`,
        tokenType: "Bearer",
        expiresIn: 900,
        session: {
          id: "123e4567-e89b-42d3-a456-426614174001",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    };
  }
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({
      status: state.refreshStatus,
      contentType: "application/json",
      body: JSON.stringify(session()),
    }),
  );
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user: state.user } }),
    }),
  );
  await page.route("**/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session()),
    }),
  );
  await page.route("**/auth/logout", (route) => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/watchlist(?:\/[^/?]+)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const ownerId = (await request.allHeaders()).authorization?.replace(
      "Bearer synthetic-watchlist-",
      "",
    );
    expect(ownerId === firstUser.id || ownerId === secondUser.id).toBe(true);
    const owner = ownerId!;
    let status: number;
    let body: unknown;
    if (method === "GET") {
      state.reads++;
      await state.readGate;
      status = state.readStatus;
      body = { data: { items: state.items.get(owner) ?? [] } };
    } else if (method === "POST") {
      state.adds++;
      const { symbol } = request.postDataJSON() as { symbol: string };
      expect(request.postDataJSON()).toEqual({ symbol });
      await state.addGate;
      status = state.addStatus;
      const item = { ...savedBtc, symbol };
      if (status === 200)
        state.items.set(owner, [
          item,
          ...(state.items.get(owner) ?? []).filter((entry) => entry.symbol !== symbol),
        ]);
      body = { data: item };
    } else {
      expect(method).toBe("DELETE");
      state.removes++;
      status = state.removeStatus;
      const symbol = new URL(request.url()).pathname.split("/").at(-1);
      if (status === 204)
        state.items.set(
          owner,
          (state.items.get(owner) ?? []).filter((item) => item.symbol !== symbol),
        );
    }
    if (status >= 400)
      body = {
        error: {
          code: status === 401 ? "UNAUTHENTICATED" : "WATCHLIST_UNAVAILABLE",
          message: "private database detail",
          details: null,
        },
      };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: status === 204 ? undefined : JSON.stringify(body),
    });
  });
  return state;
}

test("guests never fetch watchlist and the star signs in with a Markets return route", async ({
  page,
}) => {
  let watchlistCalls = 0;
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  page.on("request", (request) => {
    if (request.url().includes("/watchlist")) watchlistCalls++;
  });
  await page.goto("/");
  const star = page.getByRole("link", { name: "Sign in to add BTC-USD to watchlist", exact: true });
  await expect(star).toHaveAttribute("href", "/login?returnTo=%2F");
  await star.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
  expect(watchlistCalls).toBe(0);
});

test("saved stars load through one shared query and add/remove work with the keyboard", async ({
  page,
}) => {
  const api = await mockApi(page, [savedBtc]);
  await page.goto("/");
  const removeBtc = page.getByRole("button", {
    name: "Remove BTC-USD from watchlist",
    exact: true,
  });
  await expect(removeBtc).toBeEnabled();
  await expect(removeBtc).toHaveAttribute("aria-pressed", "true");
  await expect(removeBtc.locator("svg")).toHaveAttribute("fill", "currentColor");
  await expect(removeBtc.locator("svg")).toHaveCSS("color", "rgb(25, 216, 223)");
  expect(api.reads).toBe(1);

  const addEth = page.getByRole("button", { name: "Add ETH-USD to watchlist", exact: true });
  await addEth.locator("xpath=ancestor::tr").evaluate((row) => {
    // React delegates clicks at its root, so observe bubbling after that boundary.
    window.addEventListener("click", (event) => {
      if (event.target instanceof Node && row.contains(event.target)) {
        row.setAttribute("data-row-navigated", "true");
      }
    });
  });
  await addEth.focus();
  await page.keyboard.press("Enter");
  const removeEth = page.getByRole("button", {
    name: "Remove ETH-USD from watchlist",
    exact: true,
  });
  await expect(removeEth).toBeEnabled();
  await expect(removeEth).toHaveAttribute("aria-pressed", "true");
  await expect(removeEth.locator("xpath=ancestor::tr")).not.toHaveAttribute(
    "data-row-navigated",
    "true",
  );
  await removeEth.focus();
  await page.keyboard.press("Space");
  await expect(addEth).toBeEnabled();
  await expect(addEth).toHaveAttribute("aria-pressed", "false");
  expect(api.adds).toBe(1);
  expect(api.removes).toBe(1);
  await expect(removeBtc).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL("/");
});

test("initial watchlist loading blocks changes without hiding market data", async ({ page }) => {
  const gate = deferred();
  const api = await mockApi(page);
  api.readGate = gate.promise;
  await page.goto("/");
  const star = page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true });
  await expect(star).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading your watchlist" }),
  ).toBeVisible();
  await expect(page.getByText("$67,542.31", { exact: true })).toBeVisible();
  gate.resolve();
  await expect(star).toBeEnabled();
  expect(api.adds).toBe(0);
});

test("a pending symbol cannot be submitted twice and other symbols stay usable", async ({
  page,
}) => {
  const gate = deferred();
  const api = await mockApi(page);
  api.addGate = gate.promise;
  await page.goto("/");
  const star = page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true });
  await expect(star).toBeEnabled();
  await star.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(star).toBeDisabled();
  await expect(star).toHaveAttribute("aria-busy", "true");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Add ETH-USD to watchlist", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => api.adds).toBe(1);
  gate.resolve();
  await expect(
    page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true }),
  ).toBeEnabled();
  expect(api.adds).toBe(1);
});

test("list errors have a retry action and do not discard the Markets screen", async ({ page }) => {
  const api = await mockApi(page);
  api.readStatus = 503;
  await page.goto("/");
  const star = page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true });
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toHaveText("Your watchlist is temporarily unavailable. Please try again.");
  await expect(star).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Market Overview", exact: true })).toBeVisible();
  api.readStatus = 200;
  await page.getByRole("button", { name: "Refresh watchlist", exact: true }).click();
  await expect(star).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toHaveCount(0);
});

test("failed add/remove keep server-confirmed stars and can be retried", async ({ page }) => {
  const api = await mockApi(page);
  api.addStatus = 503;
  await page.goto("/");
  const add = page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toContainText("Your watchlist is temporarily unavailable");
  await expect(add).toBeEnabled();
  await expect(add).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("private database detail")).toHaveCount(0);
  api.addStatus = 200;
  await add.click();
  const remove = page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true });
  await expect(remove).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toHaveCount(0);
  api.removeStatus = 503;
  await remove.click();
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toBeVisible();
  await expect(remove).toBeEnabled();
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  api.removeStatus = 204;
  await remove.click();
  await expect(add).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toHaveCount(0);
});

test("expired membership authentication offers sign in instead of allowing unknown-state changes", async ({
  page,
}) => {
  const api = await mockApi(page);
  api.readStatus = 401;
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toHaveText("Your session has expired. Sign in again to continue.");
  await expect(
    page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Sign in again", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
  expect(api.adds).toBe(0);
});

test("session service failure can be retried before fetching a watchlist", async ({ page }) => {
  const api = await mockApi(page);
  api.refreshStatus = 503;
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry session", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true }),
  ).toBeDisabled();
  expect(api.reads).toBe(0);
  api.refreshStatus = 200;
  await page.getByRole("button", { name: "Retry session", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true }),
  ).toBeEnabled();
  expect(api.reads).toBe(1);
});

test("an old response after logout and another login cannot alter the next account's stars", async ({
  page,
}) => {
  const gate = deferred();
  const api = await mockApi(page);
  api.addGate = gate.promise;
  await page.goto("/");
  const star = page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true });
  await expect(star).toBeEnabled();
  await star.click();
  await expect.poll(() => api.adds).toBe(1);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in to add BTC-USD to watchlist", exact: true }),
  ).toBeVisible();
  api.user = secondUser;
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(secondUser.email);
  await page.getByLabel("Password", { exact: true }).fill("SecurePass123!");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(star).toBeEnabled();
  const response = page.waitForResponse(
    (result) => result.url().endsWith("/watchlist") && result.request().method() === "POST",
  );
  gate.resolve();
  await response;
  await expect(star).toHaveAttribute("aria-pressed", "false");
  expect(api.items.get(secondUser.id)).toEqual([]);
  await page.getByLabel("Search markets").fill("ETH");
  await page.getByLabel("Search markets").fill("BTC");
  await expect(star).toBeEnabled();
  await expect(star).toHaveAttribute("aria-pressed", "false");
});

for (const viewport of [
  { name: "desktop", width: 1586, height: 992 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "small-mobile", width: 320, height: 800 },
]) {
  test(`stars remain visible and usable on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockApi(page, [savedBtc]);
    await page.goto("/");
    const star = page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true });
    await expect(star).toBeEnabled();
    const rectangle = await star.boundingBox();
    expect(rectangle!.width).toBeGreaterThanOrEqual(viewport.width < 768 ? 40 : 36);
    expect(rectangle!.x).toBeGreaterThanOrEqual(0);
    expect(rectangle!.x + rectangle!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: testInfo.outputPath(`market-watchlist-${viewport.name}-saved.png`),
      fullPage: true,
    });
    await star.click();
    await expect(
      page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true }),
    ).toBeEnabled();
    if (viewport.width < 768)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    await page.screenshot({
      path: testInfo.outputPath(`market-watchlist-${viewport.name}.png`),
      fullPage: true,
    });
  });
}
