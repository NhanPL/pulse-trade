import { test, expect, type Locator, type Page } from "@playwright/test";
import axe from "axe-core";
import {
  realtimeCommandSchema,
  candleIntervalSchema,
  type OrderListItem,
  type PortfolioResponse,
} from "@pulse-trade/contracts";

declare global {
  interface Window {
    axe: typeof axe;
  }
}

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "a11y@example.com" };
const pendingOrder: OrderListItem = {
  id: "123e4567-e89b-42d3-a456-426614174040",
  symbol: "BTC-USD",
  side: "BUY",
  type: "LIMIT",
  status: "PENDING",
  quantity: "0.1",
  filledQuantity: "0",
  limitPrice: "45000",
  avgFillPrice: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  filledAt: null,
  cancelledAt: null,
};
const portfolio: PortfolioResponse = {
  data: {
    balances: [
      { asset: "USD", available: "5000", locked: "4500" },
      { asset: "BTC", available: "0.01", locked: "0" },
    ],
    cash: { available: "5000", locked: "4500" },
    positions: [{ asset: "BTC", averageCost: "51000", quantity: "0.01", realizedPnl: "-2" }],
    quoteCurrency: "USD",
  },
};

async function mockAccount(page: Page, authenticated = true) {
  await page.route("**/auth/refresh", (route) =>
    authenticated
      ? route.fulfill({
          json: {
            data: {
              user,
              accessToken: "synthetic-a11y-token",
              tokenType: "Bearer",
              expiresIn: 900,
              session: {
                id: "123e4567-e89b-42d3-a456-426614174001",
                expiresAt: "2099-01-01T00:00:00.000Z",
              },
            },
          },
        })
      : route.fulfill({
          status: 401,
          json: { error: { code: "UNAUTHENTICATED", message: "Sign in.", details: null } },
        }),
  );
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: { data: { user } } }));
  await page.route("**/api/v1/portfolio**", (route) => route.fulfill({ json: portfolio }));
  await page.route("**/api/v1/orders**", (route) =>
    route.fulfill({ json: { data: { items: [pendingOrder], nextCursor: null } } }),
  );
  await page.route("**/api/v1/watchlist", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "123e4567-e89b-42d3-a456-426614174050",
              symbol: "BTC-USD",
              createdAt: "2026-10-01T00:00:00.000Z",
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/v1/markets/*/candles?**", (route) => {
    const url = new URL(route.request().url());
    const interval = candleIntervalSchema.parse(url.searchParams.get("interval") ?? "1m");
    const seconds = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 }[interval];
    const time = Math.floor(Date.now() / 1000 / seconds) * seconds;
    return route.fulfill({
      json: {
        data: {
          symbol: "BTC-USD",
          interval,
          candles: [
            {
              time: time - seconds,
              open: "50000",
              high: "50010",
              low: "49990",
              close: "50000",
              volume: "1",
            },
            { time, open: "50000", high: "50010", low: "49990", close: "50000", volume: "1" },
          ],
        },
      },
    });
  });
  await page.routeWebSocket(/\/realtime$/, (socket) => {
    socket.onMessage((message) => {
      const command = realtimeCommandSchema.parse(JSON.parse(message.toString()));
      if (command.action !== "subscribe") return;
      for (const symbol of command.symbols) {
        const ts = Date.now();
        socket.send(
          JSON.stringify({
            v: 1,
            event: "ticker.update",
            ts,
            symbol,
            data: {
              price: "50000",
              high24h: "50100",
              low24h: "49900",
              change24hPercent: "-1.25",
              volume24h: "100",
              marketTs: ts,
            },
          }),
        );
      }
    });
  });
}

async function audit(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(async () => {
    const result = await window.axe.run(document);
    return {
      violations: result.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
        failures: nodes.map((node) => node.failureSummary),
      })),
      incomplete: result.incomplete.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    };
  });
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  if (results.incomplete.length > 0) {
    // Axe's incomplete results need human review, not a claim of automatic conformance.
    test.info().annotations.push({
      type: "axe-manual-review",
      description: results.incomplete
        .map(({ id, targets }) => `${id}: ${targets.length}`)
        .join(", "),
    });
  }
}

async function checkAuthGradientContrast(button: Locator) {
  // Axe cannot resolve this gradient. Check both rendered stops in the browser's sRGB space.
  const ratios = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Contrast review needs a browser canvas color converter.");
    function luminance(color: string) {
      if (!context || !CSS.supports("color", color))
        throw new Error(`Invalid contrast color: ${color}`);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    }
    const text = luminance(style.color);
    return ["--tw-gradient-from", "--tw-gradient-to"].map((property) => {
      const background = luminance(style.getPropertyValue(property).trim());
      return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
    });
  });
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
}

for (const layout of ["desktop", "mobile"] as const) {
  for (const path of [
    "/",
    "/trade/BTC-USD",
    "/login",
    "/register",
    "/portfolio",
    "/orders",
    "/watchlist",
  ]) {
    test(`${layout} ${path} has no axe accessibility violations`, async ({ page }) => {
      if (layout === "mobile") await page.setViewportSize({ width: 390, height: 844 });
      await mockAccount(page, !["/login", "/register"].includes(path));
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to main content", exact: true });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();
      if (path === "/portfolio")
        await expect(
          page.getByRole("region", { name: "Cash balances", exact: true }),
        ).toBeVisible();
      if (path === "/orders")
        await expect(page.getByRole("button", { name: "Cancel BTC-USD BUY order" })).toBeVisible();
      if (path === "/watchlist")
        await expect(page.getByRole("link", { name: "Trade BTC-USD", exact: true })).toBeVisible();
      await audit(page);
      await page.screenshot({
        path: test.info().outputPath("accessibility-review.png"),
        fullPage: true,
      });
      if (layout === "mobile" && !["/login", "/register"].includes(path)) {
        const trigger = page.getByRole("button", { name: "Open navigation menu", exact: true });
        await trigger.press("Enter");
        await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
        await audit(page);
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Markets", exact: true })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
      }
      if (path === "/orders") {
        const cancel = page.getByRole("button", { name: "Cancel BTC-USD BUY order" });
        await cancel.press("Enter");
        const dialog = page.getByRole("dialog", { name: "Cancel Order", exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator(":focus")).toHaveCount(1);
        await audit(page);
        await dialog.getByRole("button", { name: "Close cancellation dialog" }).focus();
        await page.keyboard.press("Shift+Tab");
        await expect(dialog.getByRole("button", { name: "Yes, Cancel Order" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(
          dialog.getByRole("button", { name: "Close cancellation dialog" }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(cancel).toBeFocused();
      }
      if (path === "/trade/BTC-USD" && layout === "mobile") {
        await page.getByRole("tab", { name: "Order book", exact: true }).press("ArrowRight");
        const tab = page.getByRole("tab", { name: "Recent trades", exact: true });
        await expect(tab).toBeFocused();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        const panelId = await tab.getAttribute("aria-controls");
        if (!panelId) throw new Error("The recent-trades tab must identify its panel.");
        await expect(
          page.getByRole("tabpanel", { name: "Recent trades", exact: true }),
        ).toHaveAttribute("id", panelId);
        const scroll = page.getByRole("region", {
          name: "BTC-USD recent trades scrolling area",
          exact: true,
        });
        await scroll.press("ArrowRight");
        await expect
          .poll(() => scroll.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
        await audit(page);
      }
      if (path === "/trade/BTC-USD") {
        await page.getByRole("tab", { name: "BUY", exact: true }).press("ArrowRight");
        await expect(page.getByRole("tab", { name: "SELL", exact: true })).toBeFocused();
        await expect(page.getByRole("tab", { name: "SELL", exact: true })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await expect(page.getByRole("tab", { name: "BUY", exact: true })).toHaveAttribute(
          "tabindex",
          "-1",
        );
        await audit(page);
        await page.keyboard.press("Home");
        await expect(page.getByRole("tab", { name: "BUY", exact: true })).toBeFocused();
        await page.keyboard.press("End");
        await expect(page.getByRole("tab", { name: "SELL", exact: true })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("tab", { name: "LIMIT", exact: true })).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("tab", { name: "MARKET", exact: true })).toBeFocused();
        await expect(page.getByRole("tabpanel", { name: "MARKET", exact: true })).toBeVisible();
        await audit(page);
      }
      if (["/login", "/register"].includes(path)) {
        const submit = page.getByRole("button", {
          name: path === "/login" ? "Sign In" : "Create Account",
          exact: true,
        });
        await checkAuthGradientContrast(submit);
        await submit.press("Enter");
        const email = page.getByLabel("Email", { exact: true });
        await expect(email).toBeFocused();
        await expect(email).toHaveAttribute("aria-invalid", "true");
        await expect(email).toHaveAccessibleDescription("Enter a valid email address.");
        await audit(page);
      }
    });
  }
}

for (const resource of ["portfolio", "orders", "watchlist"] as const) {
  test(`${resource} loading, empty and error states remain accessible`, async ({ page }) => {
    await mockAccount(page);
    let release: () => void = () => {};
    const loading = new Promise<void>((resolve) => {
      release = resolve;
    });
    let state: "loading" | "empty" | "error" = "loading";
    await page.route(`**/api/v1/${resource}**`, async (route) => {
      if (state === "loading") await loading;
      if (state === "error")
        return route.fulfill({
          status: 400,
          json: { error: { code: "UNAVAILABLE", message: "Unavailable.", details: null } },
        });
      return route.fulfill({
        json:
          resource === "portfolio"
            ? {
                data: {
                  balances: [{ asset: "USD", available: "10000", locked: "0" }],
                  cash: { available: "10000", locked: "0" },
                  positions: [],
                  quoteCurrency: "USD",
                },
              }
            : { data: { items: [], ...(resource === "orders" ? { nextCursor: null } : {}) } },
      });
    });
    try {
      await page.goto(`/${resource}`);
      const label = {
        portfolio: "Portfolio loading",
        orders: "Open orders loading",
        watchlist: "Watchlist loading",
      }[resource];
      await expect(page.getByRole("status", { name: label, exact: true })).toBeVisible();
      await audit(page);
      state = "empty";
      release();
      const empty = {
        portfolio: "No crypto positions yet",
        orders: "You have no open orders.",
        watchlist: "Your watchlist is empty.",
      }[resource];
      await expect(page.getByRole("heading", { name: empty, exact: true })).toBeVisible();
      await audit(page);
      state = "error";
      await page.reload();
      await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
      await audit(page);
    } finally {
      release();
    }
  });
}
