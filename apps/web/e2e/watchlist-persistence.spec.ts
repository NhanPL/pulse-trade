import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import type { WatchlistItem } from "@pulse-trade/contracts";

const firstUser = { id: "123e4567-e89b-42d3-a456-426614174000", email: "saved@example.com" };
const secondUser = { id: "123e4567-e89b-42d3-a456-426614174002", email: "other@example.com" };
const password = "PersistencePass123!";
const cookieName = "pulse_trade_refresh";
const cookiePath = "/api/v1/auth";

function item(symbol: string, index: number): WatchlistItem {
  return {
    id: `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
    symbol,
    createdAt: "2026-10-04T00:00:00.000Z",
  };
}
const btc = item("BTC-USD", 10);
const eth = item("ETH-USD", 11);
const sol = item("SOL-USD", 12);
type Owner = typeof firstUser;
type Session = { user: Owner; revoked: boolean };
type Command = { action: "subscribe" | "unsubscribe"; channels: string[]; symbols: string[] };

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// This server-side fixture outlives browser documents; reload must use REST, not a JS/storage cache.
async function mockPersistence(context: BrowserContext, firstItems = [btc], secondItems = [sol]) {
  const records = new Map<string, WatchlistItem[]>([
    [firstUser.id, [...firstItems]],
    [secondUser.id, [...secondItems]],
  ]);
  const sessions = new Set<Session>();
  const cookies = new Map<string, Session>();
  const tokens = new Map<string, Session>();
  const state = {
    readStatus: 200,
    writeStatus: 200,
    refreshes: 0,
    sockets: 0,
    refreshGate: null as Promise<void> | null,
    readGate: null as Promise<void> | null,
  };
  const reads: { owner: string; token: string }[] = [];
  const writes: { owner: string; method: string; symbol: string }[] = [];
  const commands: Command[] = [];
  let sequence = 0;
  let eventTs = 100;

  function issue(session: Session) {
    const credential = `r${String(++sequence).padStart(42, "0")}`;
    const accessToken = `synthetic-persistence-access-${sequence}`;
    cookies.set(credential, session);
    tokens.set(accessToken, session);
    return {
      credential,
      body: {
        data: {
          user: session.user,
          accessToken,
          tokenType: "Bearer",
          expiresIn: 900,
          session: {
            id: "123e4567-e89b-42d3-a456-426614174001",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        },
      },
    };
  }
  const initialSession: Session = { user: firstUser, revoked: false };
  sessions.add(initialSession);
  const initial = issue(initialSession);
  await context.addCookies([
    {
      name: cookieName,
      value: initial.credential,
      domain: "localhost",
      path: cookiePath,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  async function json(route: Route, status: number, body: unknown, cookie?: string) {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
      headers: {
        "cache-control": "no-store",
        ...(cookie ? { "set-cookie": cookie } : {}),
      },
    });
  }
  async function failure(route: Route, status: number) {
    await json(route, status, {
      error: {
        code: status === 401 ? "UNAUTHENTICATED" : "WATCHLIST_UNAVAILABLE",
        message: "private database detail",
        details: null,
      },
    });
  }
  function authorized(route: Route) {
    const token =
      route
        .request()
        .headers()
        .authorization?.replace(/^Bearer /, "") ?? "";
    const session = tokens.get(token);
    return session && !session.revoked ? { session, token } : null;
  }
  const cookieHeader = (credential: string) =>
    `${cookieName}=${credential}; Path=${cookiePath}; HttpOnly; SameSite=Lax`;

  await context.route("**/auth/refresh", async (route) => {
    state.refreshes++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    const credential = (await route.request().allHeaders()).cookie
      ?.split("; ")
      .find((cookie) => cookie.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    const session = credential ? cookies.get(credential) : undefined;
    await state.refreshGate;
    if (!session || session.revoked) return failure(route, 401);
    cookies.delete(credential!);
    const refreshed = issue(session);
    await json(route, 200, refreshed.body, cookieHeader(refreshed.credential));
  });
  await context.route("**/api/v1/me", async (route) => {
    const auth = authorized(route);
    if (!auth) return failure(route, 401);
    await json(route, 200, { data: { user: auth.session.user } });
  });
  await context.route("**/auth/login", async (route) => {
    const body = route.request().postDataJSON() as { email: string; password: string };
    expect(body.password).toBe(password);
    const user = [firstUser, secondUser].find((entry) => entry.email === body.email);
    if (!user) return failure(route, 401);
    const session: Session = { user, revoked: false };
    sessions.add(session);
    const login = issue(session);
    await json(route, 200, login.body, cookieHeader(login.credential));
  });
  await context.route("**/auth/logout", async (route) => {
    const auth = authorized(route);
    if (!auth) return failure(route, 401);
    auth.session.revoked = true;
    await route.fulfill({
      status: 204,
      headers: {
        "set-cookie": `${cookieName}=; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    });
  });
  await context.route(/\/api\/v1\/watchlist(?:\/[^/?]+)?$/, async (route) => {
    const auth = authorized(route);
    expect(auth, "private requests require the restored in-memory bearer token").not.toBeNull();
    if (!auth) return failure(route, 401);
    const owner = auth.session.user.id;
    const method = route.request().method();
    if (method === "GET") {
      reads.push({ owner, token: auth.token });
      await state.readGate;
      if (state.readStatus !== 200) return failure(route, state.readStatus);
      return json(route, 200, { data: { items: records.get(owner) ?? [] } });
    }
    const symbol =
      method === "POST"
        ? (route.request().postDataJSON() as { symbol: string }).symbol
        : new URL(route.request().url()).pathname.split("/").at(-1)!;
    expect(["POST", "DELETE"]).toContain(method);
    writes.push({ owner, method, symbol });
    if (state.writeStatus !== 200) return failure(route, state.writeStatus);
    const current = records.get(owner) ?? [];
    if (method === "DELETE") {
      records.set(
        owner,
        current.filter((saved) => saved.symbol !== symbol),
      );
      return route.fulfill({ status: 204 });
    }
    expect(route.request().postDataJSON()).toEqual({ symbol });
    const saved =
      current.find((entry) => entry.symbol === symbol) ?? item(symbol, 100 + writes.length);
    if (!current.includes(saved)) records.set(owner, [saved, ...current]);
    return json(route, 200, { data: saved });
  });
  await context.routeWebSocket(/\/realtime$/, (socket) => {
    state.sockets++;
    socket.onMessage((message) => {
      const command = JSON.parse(message.toString()) as Command;
      commands.push(command);
      if (command.action !== "subscribe") return;
      for (const symbol of command.symbols)
        socket.send(
          JSON.stringify({
            v: 1,
            event: "ticker.update",
            symbol,
            ts: ++eventTs,
            data: {
              price: symbol === "BTC-USD" ? "67542.31" : "3482.67",
              change24hPercent: "1.25",
              high24h: "67542.31",
              low24h: "100",
              volume24h: "1000",
              marketTs: eventTs,
            },
          }),
        );
    });
  });
  return {
    records,
    state,
    reads,
    writes,
    commands,
    revokeSessions(owner: string) {
      for (const session of sessions) if (session.user.id === owner) session.revoked = true;
    },
  };
}

function star(page: Page, symbol: string, saved: boolean) {
  return page.getByRole("button", {
    name: `${saved ? "Remove" : "Add"} ${symbol} ${saved ? "from" : "to"} watchlist`,
    exact: true,
  });
}
function rows(page: Page) {
  return page.getByRole("region", { name: "Saved markets", exact: true }).locator("tbody > tr");
}
async function expectLiveWatchlist(page: Page) {
  // Each reload must receive a new ticker stream, not merely match the prior document's command.
  await expect(page.locator("footer[role=status]")).toContainText("Prices and data are real-time.");
}
async function login(page: Page, user: Owner) {
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/watchlist$/);
}
async function noPersistentPrivateCache(page: Page, context: BrowserContext) {
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  expect(await page.evaluate(() => document.cookie)).not.toContain(cookieName);
  const cookie = (await context.cookies()).find((entry) => entry.name === cookieName);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe(cookiePath);
  await expect(page.locator("body")).not.toContainText("synthetic-persistence-access-");
}

for (const viewport of [
  { name: "desktop", width: 1586, height: 992 },
  { name: "small-mobile", width: 320, height: 800 },
]) {
  test(`confirmed saves and removals survive real document reloads on ${viewport.name}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const api = await mockPersistence(context, []);
    await page.goto("/");
    for (const symbol of ["BTC-USD", "ETH-USD"]) {
      await expect(star(page, symbol, false)).toBeEnabled();
      await star(page, symbol, false).click();
      await expect(star(page, symbol, true)).toBeEnabled();
    }
    const persisted = [...api.records.get(firstUser.id)!];
    const oldToken = api.reads.at(-1)!.token;
    await page.reload();
    for (const symbol of ["BTC-USD", "ETH-USD"])
      await expect(star(page, symbol, true)).toHaveAttribute("aria-pressed", "true");
    expect(api.reads.at(-1)!.token).not.toBe(oldToken);
    expect(api.records.get(firstUser.id)).toEqual(persisted);
    expect(api.writes).toHaveLength(2);
    await page.goto("/watchlist");
    await expect(rows(page)).toHaveCount(2);
    await expect(star(page, "BTC-USD", true)).toBeEnabled();
    await expectLiveWatchlist(page);
    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await expectLiveWatchlist(page);
    await expect.poll(() => api.commands.at(-1)?.symbols).toEqual(["BTC-USD", "ETH-USD"]);
    expect(api.commands.at(-1)?.channels).toEqual(["ticker"]);
    await star(page, "BTC-USD", true).click();
    await expect(rows(page)).toHaveCount(1);
    await page.reload();
    await expect(rows(page)).toHaveCount(1);
    await expect(star(page, "ETH-USD", true)).toBeEnabled();
    await expect(star(page, "BTC-USD", true)).toHaveCount(0);
    await expectLiveWatchlist(page);
    await expect.poll(() => api.commands.at(-1)?.symbols).toEqual(["ETH-USD"]);
    await noPersistentPrivateCache(page, context);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`watchlist-persistence-${viewport.name}.png`),
      fullPage: true,
    });
    await page.goto("/");
    await expect(star(page, "BTC-USD", false)).toBeEnabled();
    await expect(star(page, "ETH-USD", true)).toHaveAttribute("aria-pressed", "true");
    expect(api.records.get(firstUser.id)).toEqual(
      persisted.filter((entry) => entry.symbol !== "BTC-USD"),
    );
    expect(api.writes).toHaveLength(3);
  });
}

test("logout and login preserve server membership without sharing the previous account's list", async ({
  page,
  context,
}) => {
  const api = await mockPersistence(context, [btc, eth], [sol]);
  await page.goto("/watchlist");
  await expect(rows(page)).toHaveCount(2);
  await star(page, "BTC-USD", true).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwatchlist$/);
  await expect(page.getByRole("region", { name: "Saved markets", exact: true })).toHaveCount(0);
  expect(api.records.get(firstUser.id)).toEqual([eth]);
  await login(page, secondUser);
  await expect(rows(page)).toHaveCount(1);
  await expect(star(page, "SOL-USD", true)).toBeEnabled();
  await expect(star(page, "ETH-USD", true)).toHaveCount(0);
  await page.reload();
  await expect(star(page, "SOL-USD", true)).toBeEnabled();
  expect(api.reads.at(-1)?.owner).toBe(secondUser.id);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwatchlist$/);
  await login(page, firstUser);
  await expect(star(page, "ETH-USD", true)).toBeEnabled();
  await expect(star(page, "BTC-USD", true)).toHaveCount(0);
  await expect(star(page, "SOL-USD", true)).toHaveCount(0);
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  expect(api.reads.at(-1)?.owner).toBe(firstUser.id);
  expect(api.records.get(secondUser.id)).toEqual([sol]);
  await noPersistentPrivateCache(page, context);
});

test("a fresh tab restores the latest server list instead of another document's cache", async ({
  page,
  context,
}) => {
  const api = await mockPersistence(context);
  await page.goto("/watchlist");
  await expect(star(page, "BTC-USD", true)).toBeEnabled();
  await expectLiveWatchlist(page);
  const oldToken = api.reads.at(-1)!.token;
  api.records.set(firstUser.id, [eth, sol]);
  const fresh = await context.newPage();
  await fresh.goto("/watchlist");
  await expect(rows(fresh)).toHaveCount(2);
  await expect(star(fresh, "ETH-USD", true)).toBeEnabled();
  await expect(star(fresh, "SOL-USD", true)).toBeEnabled();
  await expect(star(fresh, "BTC-USD", true)).toHaveCount(0);
  await expectLiveWatchlist(fresh);
  expect(api.reads.at(-1)!.token).not.toBe(oldToken);
  await expect.poll(() => api.commands.at(-1)?.symbols).toEqual(["ETH-USD", "SOL-USD"]);
  await noPersistentPrivateCache(fresh, context);
  await fresh.close();
});

test("reload waits for session verification then REST before restoring membership and streams", async ({
  page,
  context,
}) => {
  const api = await mockPersistence(context);
  await page.goto("/watchlist");
  await expect(star(page, "BTC-USD", true)).toBeEnabled();
  await expectLiveWatchlist(page);
  const previousReads = api.reads.length;
  const previousSockets = api.state.sockets;
  const refresh = deferred();
  const read = deferred();
  api.state.refreshGate = refresh.promise;
  api.state.readGate = read.promise;
  api.records.set(firstUser.id, [eth]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Checking your session", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved markets", exact: true })).toHaveCount(0);
  expect(api.reads).toHaveLength(previousReads);
  expect(api.state.sockets).toBe(previousSockets);
  refresh.resolve();
  await expect(page.getByRole("status", { name: "Watchlist loading", exact: true })).toBeVisible();
  await expect.poll(() => api.reads.length).toBe(previousReads + 1);
  expect(api.state.sockets).toBe(previousSockets);
  read.resolve();
  await expect(star(page, "ETH-USD", true)).toBeEnabled();
  await expect(star(page, "BTC-USD", true)).toHaveCount(0);
  await expectLiveWatchlist(page);
  await expect.poll(() => api.commands.at(-1)?.symbols).toEqual(["ETH-USD"]);
  expect(api.state.sockets).toBe(previousSockets + 1);
});

test("REST failure after reload offers retry without reviving an old list or overwriting persistence", async ({
  page,
  context,
}) => {
  const api = await mockPersistence(context);
  await page.goto("/watchlist");
  await expect(star(page, "BTC-USD", true)).toBeEnabled();
  await expectLiveWatchlist(page);
  api.records.set(firstUser.id, [eth]);
  api.state.readStatus = 503;
  const sockets = api.state.sockets;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Watchlist unavailable", exact: true }),
  ).toBeVisible();
  await expect(star(page, "BTC-USD", true)).toHaveCount(0);
  await expect(page.getByText("No saved markets yet.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("private database detail", { exact: true })).toHaveCount(0);
  expect(api.state.sockets).toBe(sockets);
  expect(api.records.get(firstUser.id)).toEqual([eth]);
  expect(api.writes).toHaveLength(0);
  api.state.readStatus = 200;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(star(page, "ETH-USD", true)).toBeEnabled();
  await expect.poll(() => api.commands.at(-1)?.symbols).toEqual(["ETH-USD"]);
});

test("an expired session after reload cannot restore private rows but re-login restores saved symbols", async ({
  page,
  context,
}) => {
  const api = await mockPersistence(context);
  await page.goto("/watchlist");
  await expect(star(page, "BTC-USD", true)).toBeEnabled();
  await expectLiveWatchlist(page);
  api.revokeSessions(firstUser.id);
  const reads = api.reads.length;
  const sockets = api.state.sockets;
  await page.reload();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwatchlist$/);
  await expect(page.getByRole("region", { name: "Saved markets", exact: true })).toHaveCount(0);
  expect(api.reads).toHaveLength(reads);
  expect(api.state.sockets).toBe(sockets);
  expect(api.records.get(firstUser.id)).toEqual([btc]);
  await login(page, firstUser);
  await expect(star(page, "BTC-USD", true)).toBeEnabled();
  expect(api.reads.at(-1)?.owner).toBe(firstUser.id);
});

test("unconfirmed add and remove failures remain unchanged after reload", async ({
  page,
  context,
}) => {
  const api = await mockPersistence(context);
  api.state.writeStatus = 503;
  await page.goto("/");
  await expect(star(page, "ETH-USD", false)).toBeEnabled();
  await star(page, "ETH-USD", false).click();
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toBeVisible();
  await page.reload();
  await expect(star(page, "ETH-USD", false)).toHaveAttribute("aria-pressed", "false");
  await expect(star(page, "BTC-USD", true)).toBeEnabled();
  await star(page, "BTC-USD", true).click();
  await expect(
    page.getByRole("region", { name: "Crypto markets", exact: true }).getByRole("alert"),
  ).toBeVisible();
  await page.reload();
  await expect(star(page, "BTC-USD", true)).toHaveAttribute("aria-pressed", "true");
  expect(api.records.get(firstUser.id)).toEqual([btc]);
});
