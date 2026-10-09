import { expect, test } from "@playwright/test";

const collector = "https://localhost:3100/api/1/envelope/**";

for (const viewport of [
  { width: 1586, height: 992 },
  { width: 375, height: 812 },
]) {
  test(`chart error stays local and retries with the keyboard at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const envelopes: string[] = [];
    await page.route(collector, async (route) => {
      envelopes.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 200,
        body: "{}",
        headers: { "access-control-allow-origin": "*" },
      });
    });
    await page.route("**/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
    await page.route("**/markets/BTC-USD/candles**", (route) =>
      route.fulfill({ json: { data: { candles: [], interval: "1m", symbol: "BTC-USD" } } }),
    );
    await page.routeWebSocket("**/realtime", () => {});
    await page.addInitScript(() => {
      let failOnce = true;
      const getRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        if (failOnce && this.getAttribute("aria-label") === "BTC-USD candlestick chart") {
          failOnce = false;
          throw new Error("synthetic private-chart-token");
        }
        return getRect.call(this);
      };
    });
    await page.goto("/trade/BTC-USD");
    const chart = page.getByRole("region", { name: "Candlestick chart", exact: true });
    await expect(chart.getByRole("alert")).toHaveText(/Chart could not be displayed/);
    await expect(page.getByRole("tab", { name: "BUY", exact: true })).toBeEnabled();
    await expect(page.getByRole("tab", { name: "SELL", exact: true })).toBeEnabled();
    await expect
      .poll(() => envelopes.some((body) => body.includes('"kind":"chart_error"')))
      .toBe(true);
    expect(envelopes.join("\n")).not.toContain("private-chart-token");
    await chart.screenshot({ path: testInfo.outputPath("chart-error.png") });
    await chart.getByRole("button", { name: "Retry chart" }).press("Enter");
    await expect(chart.getByRole("heading", { name: "No chart data available" })).toBeVisible();
    await expect(chart.locator("canvas").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`production error reporting is private and bounded at ${viewport.width}px`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize(viewport);
    const envelopes: string[] = [];
    await page.route(collector, async (route) => {
      const headers = await route.request().allHeaders();
      expect(headers.cookie).toBeUndefined();
      expect(headers.authorization).toBeUndefined();
      expect(headers.referer).toBeUndefined();
      envelopes.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 200,
        body: "{}",
        headers: { "access-control-allow-origin": "*" },
      });
    });
    await page.route("**/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
    await context.addCookies([
      { name: "private-cookie", value: "private-cookie-value", url: "http://localhost:3100" },
    ]);
    await page.goto("/login?token=private-query#private-hash");
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("private-email@example.com");
    await page.getByLabel("Password", { exact: true }).fill("private-password");
    await page.evaluate(() => {
      localStorage.setItem("private-token", "private-storage-value");
      setTimeout(() => {
        throw new TypeError("private-password private-token quantity=500");
      }, 0);
      void Promise.reject({ cookie: "private-cookie-value", email: "private-email@example.com" });
    });
    await expect.poll(() => envelopes.length).toBe(2);
    const serialized = envelopes.join("\n");
    expect(serialized).toContain("uncaught_error");
    expect(serialized).toContain("unhandled_rejection");
    expect(serialized).toContain('"page":"login"');
    expect(serialized).toContain('"release":"e2e-p04"');
    for (const value of [
      "private-",
      "quantity",
      "password",
      "breadcrumbs",
      '"user":',
      '"request":',
      '"contexts":',
      '"extra":',
    ]) {
      expect(serialized).not.toContain(value);
    }
    await page.evaluate(() => {
      const bundle = [...document.scripts].find((script) =>
        script.src.includes("/_next/static/"),
      )!.src;
      for (let line = 1; line <= 100; line++) {
        const error = new Error("private-token");
        error.stack = "Error: private-token\n    at private (" + bundle + ":" + line + ":1)";
        window.dispatchEvent(new ErrorEvent("error", { error }));
      }
    });
    await expect.poll(() => envelopes.length).toBe(10);
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("a failing reporting transport does not prevent login validation or cause a report loop", async ({
  page,
}) => {
  let reports = 0;
  await page.route(collector, async (route) => {
    reports++;
    await route.abort();
  });
  await page.route("**/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("synthetic collector failure");
    }, 0);
  });
  await expect.poll(() => reports).toBe(1);
  await page.getByRole("button", { name: "Sign In", exact: true }).press("Enter");
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
  expect(reports).toBe(1);
});
