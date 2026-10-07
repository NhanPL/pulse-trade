import type { Page } from "@playwright/test";
import {
  loginResponseSchema,
  meResponseSchema,
  registerResponseSchema,
  watchlistAddResponseSchema,
  watchlistListResponseSchema,
  type WatchlistItem,
} from "@pulse-trade/contracts";

import { expect, test } from "./fixtures";

const apiURL = "http://127.0.0.1:3111/api/v1";

function waitForAPI(page: Page, path: string, method = "GET") {
  return page.waitForResponse(
    (response) => response.url() === `${apiURL}${path}` && response.request().method() === method,
  );
}

for (const layout of ["desktop", "mobile"] as const) {
  test(`${layout} watchlist add, reload and removal persist through the real API and database`, async ({
    page,
    request,
    context,
    paperAccount,
  }) => {
    // No REST/WS interception: only the existing test-only market provider supplies fixed BTC ticks.
    const password = "O06-watchlist-password";
    const registration = await request.post(`${apiURL}/auth/register`, {
      data: { email: paperAccount.email, password },
    });
    expect(registration.status()).toBe(201);
    const user = registerResponseSchema.parse(await registration.json()).data.user;
    expect(await paperAccount.readWatchlist()).toEqual([]);
    if (layout === "mobile") await page.setViewportSize({ width: 320, height: 800 });

    const browserErrors: string[] = [];
    let reads = 0;
    let adds = 0;
    let removals = 0;
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("request", (request) => {
      if (request.url() === `${apiURL}/watchlist`) {
        if (request.method() === "GET") reads++;
        if (request.method() === "POST") adds++;
      }
      if (request.url() === `${apiURL}/watchlist/BTC-USD` && request.method() === "DELETE")
        removals++;
    });
    const empty = page.getByRole("status", { name: "Empty watchlist", exact: true });
    const rows = page
      .getByRole("region", { name: "Saved markets", exact: true })
      .locator("tbody > tr");
    const add = page.getByRole("button", { name: "Add BTC-USD to watchlist", exact: true });
    const remove = page.getByRole("button", { name: "Remove BTC-USD from watchlist", exact: true });

    async function reloadMembership(items: WatchlistItem[]) {
      const refreshResponse = waitForAPI(page, "/auth/refresh", "POST");
      const meResponse = waitForAPI(page, "/me");
      const watchlistResponse = waitForAPI(page, "/watchlist");
      await page.reload();
      expect((await refreshResponse).status()).toBe(200);
      const me = await meResponse;
      expect(me.status()).toBe(200);
      expect(meResponseSchema.parse(await me.json()).data.user).toEqual(user);
      const watchlist = await watchlistResponse;
      expect(watchlist.status()).toBe(200);
      expect(watchlist.headers()["cache-control"]).toBe("no-store");
      expect(watchlistListResponseSchema.parse(await watchlist.json()).data).toEqual({ items });
      expect(await paperAccount.readWatchlist()).toEqual(items);
    }

    async function expectSavedMarket() {
      await expect(rows).toHaveCount(1);
      await expect(rows.getByRole("link", { name: "Trade BTC-USD", exact: true })).toBeVisible();
      await expect(rows.getByRole("cell").first()).toContainText("$50,000.00");
      await expect(page.locator("footer[role=status]")).toContainText(
        "Prices and data are real-time.",
      );
      await expect(remove).toBeEnabled();
      await expect(empty).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }

    // A fresh unauthenticated document must not fetch the private shortlist.
    await page.goto("/watchlist");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fwatchlist$/);
    await expect(page.getByRole("region", { name: "Saved markets", exact: true })).toHaveCount(0);
    expect(reads).toBe(0);
    await page.getByLabel("Email", { exact: true }).fill(paperAccount.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const loginResponse = waitForAPI(page, "/auth/login", "POST");
    const initialWatchlistResponse = waitForAPI(page, "/watchlist");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    const login = await loginResponse;
    expect(login.status()).toBe(200);
    // Only public identity is asserted; never print access tokens or cookie values on failure.
    expect(loginResponseSchema.parse(await login.json()).data.user).toEqual(user);
    const initialWatchlist = await initialWatchlistResponse;
    expect(initialWatchlist.status()).toBe(200);
    expect(watchlistListResponseSchema.parse(await initialWatchlist.json()).data).toEqual({
      items: [],
    });
    await expect(page).toHaveURL("/watchlist");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Save markets using the star on the Markets page.");
    await expect(rows).toHaveCount(0);

    const explore = empty.getByRole("link", { name: "Explore Markets", exact: true });
    await expect(explore).toHaveAttribute("href", "/");
    await explore.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/");
    await expect(add).toBeEnabled();
    await expect(add).toHaveAttribute("aria-pressed", "false");
    const addResponse = waitForAPI(page, "/watchlist", "POST");
    const confirmedAddListResponse = waitForAPI(page, "/watchlist");
    await add.focus();
    await page.keyboard.press("Enter");
    const added = await addResponse;
    expect(added.status()).toBe(200);
    expect(added.request().postDataJSON()).toEqual({ symbol: "BTC-USD" });
    const item = watchlistAddResponseSchema.parse(await added.json()).data;
    expect(item).toEqual({
      id: expect.any(String),
      symbol: "BTC-USD",
      createdAt: expect.any(String),
    });
    const confirmedAddList = await confirmedAddListResponse;
    expect(confirmedAddList.status()).toBe(200);
    expect(watchlistListResponseSchema.parse(await confirmedAddList.json()).data).toEqual({
      items: [item],
    });
    await expect(remove).toHaveAttribute("aria-pressed", "true");
    await expect(remove).toBeEnabled();
    expect(await paperAccount.readWatchlist()).toEqual([item]);

    // A new Markets document restores server membership, without replaying the POST.
    await reloadMembership([item]);
    await expect(remove).toHaveAttribute("aria-pressed", "true");
    await expect(remove).toBeEnabled();
    expect(adds).toBe(1);
    if (layout === "mobile")
      await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.getByRole("link", { name: "Watchlist", exact: true }).click();
    await expect(page).toHaveURL("/watchlist");
    await expectSavedMarket();

    // REST contains no prices; a fresh Watchlist document must receive its ticker via the real gateway.
    await reloadMembership([item]);
    await expectSavedMarket();
    expect(adds).toBe(1);
    expect(removals).toBe(0);
    const removeResponse = waitForAPI(page, "/watchlist/BTC-USD", "DELETE");
    const confirmedRemovalListResponse = waitForAPI(page, "/watchlist");
    await remove.focus();
    await page.keyboard.press("Enter");
    const removed = await removeResponse;
    expect(removed.status()).toBe(204);
    // Chromium exposes no body resource for HTTP 204; validate framing and the reconciled GET.
    expect(removed.headers()["content-length"]).toBeUndefined();
    expect(removed.headers()["transfer-encoding"]).toBeUndefined();
    const confirmedRemovalList = await confirmedRemovalListResponse;
    expect(confirmedRemovalList.status()).toBe(200);
    expect(watchlistListResponseSchema.parse(await confirmedRemovalList.json()).data).toEqual({
      items: [],
    });
    await expect(empty).toBeVisible();
    await expect(rows).toHaveCount(0);
    await expect(remove).toHaveCount(0);
    expect(await paperAccount.readWatchlist()).toEqual([]);

    await reloadMembership([]);
    await expect(empty).toBeVisible();
    await expect(rows).toHaveCount(0);
    await expect(page.locator("footer[role=status]")).toContainText("No market subscriptions.");
    const totalWatched = page
      .getByRole("region", { name: "Watchlist summary", exact: true })
      .locator("dd")
      .first();
    await expect(totalWatched).toHaveText("0 symbols");
    await expect(empty.getByRole("link", { name: "Explore Markets", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(adds).toBe(1);
    expect(removals).toBe(1);
    expect(browserErrors).toEqual([]);
    expect(await paperAccount.readState()).toEqual({
      userId: user.id,
      sessions: 1,
      balances: [{ asset: "USD", available: "10000", locked: "0" }],
      positions: [],
      orders: [],
      trades: [],
    });
    expect(
      await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
    ).toEqual({ local: [], session: [] });
    const refreshCookies = (await context.cookies()).filter(
      (cookie) => cookie.name === "pulse_trade_refresh",
    );
    expect(refreshCookies.length).toBe(1);
    expect(refreshCookies[0]?.httpOnly).toBe(true);
    expect(refreshCookies[0]?.path).toBe("/api/v1/auth");
  });
}
