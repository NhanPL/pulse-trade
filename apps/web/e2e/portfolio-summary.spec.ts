import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-portfolio-summary-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: { id: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2099-01-01T00:00:00.000Z" },
  },
};
const portfolio = {
  data: {
    cash: { available: "18642.30", locked: "0.00" },
    positions: [],
    quoteCurrency: "USD",
  },
};
const metrics = [
  { label: "Total Value", amount: "$18,642.30" },
  { label: "Unrealized P&L", amount: "$0.00" },
  { label: "Realized P&L", amount: "—" },
  { label: "Cash Balance", amount: "$18,642.30" },
];

async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }),
  );
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user } }),
    }),
  );
  await page.route("**/api/v1/portfolio", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(portfolio),
    }),
  );
}

test("shows four clearly labeled metrics from the account snapshot", async ({ page }) => {
  await mockAuthenticatedSession(page);

  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
  await expect(
    page.getByText("Track your paper trading performance and asset allocation.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Paper account", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Balances and positions come from your account. Market prices update live.", {
      exact: true,
    }),
  ).toBeVisible();

  const summary = page.getByRole("region", { name: "Portfolio summary", exact: true });
  await expect(summary.locator("dt")).toHaveCount(4);
  for (const metric of metrics) {
    const label = summary.locator("dt").filter({
      has: page.locator(`summary[aria-label="About ${metric.label}"]`),
    });
    await expect(label).toBeVisible();
    await expect(label.locator("xpath=following-sibling::dd[1]")).toHaveText(metric.amount);
  }
});

test("metric explanations can be opened and closed with the keyboard", async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.goto("/portfolio");
  const summary = page.getByRole("region", { name: "Portfolio summary", exact: true });

  for (const metric of metrics) {
    const help = summary.locator(`summary[aria-label="About ${metric.label}"]`);
    const disclosure = help.locator("..");
    await expect(help).toBeVisible();
    await expect(disclosure).not.toHaveAttribute("open");
    await help.focus();
    await expect(help).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(disclosure.locator("p")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(disclosure.locator("p")).toBeHidden();
  }
});

for (const viewport of [
  { name: "desktop", width: 1586, height: 992, columns: 4 },
  { name: "compact-desktop", width: 1024, height: 768, columns: 2 },
  { name: "tablet", width: 768, height: 1024, columns: 2 },
  { name: "mobile", width: 360, height: 800, columns: 1 },
  { name: "small-mobile", width: 320, height: 800, columns: 1 },
]) {
  test(`summary cards remain readable in the ${viewport.name} layout`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAuthenticatedSession(page);
    await page.goto("/portfolio");
    const summary = page.getByRole("region", { name: "Portfolio summary", exact: true });
    await expect(summary).toBeVisible();
    const cards = summary.locator("dl > div");
    await expect(cards).toHaveCount(4);

    const rectangles = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width } = element.getBoundingClientRect();
        return { x, y, width };
      }),
    );
    for (let index = 0; index < rectangles.length; index++) {
      const rectangle = rectangles[index]!;
      const rowStart = rectangles[Math.floor(index / viewport.columns) * viewport.columns]!;
      expect(Math.abs(rectangle.y - rowStart.y)).toBeLessThan(1);
      expect(rectangle.width).toBeGreaterThan(200);
      if (index % viewport.columns > 0) {
        const previous = rectangles[index - 1]!;
        expect(rectangle.x).toBeGreaterThan(previous.x + previous.width);
      } else if (index > 0) {
        expect(rectangle.y).toBeGreaterThan(rectangles[index - 1]!.y);
        expect(Math.abs(rectangle.x - rectangles[0]!.x)).toBeLessThan(1);
      }
    }
    for (const metric of metrics) {
      const card = summary.locator("dl > div").filter({
        has: page.locator(`summary[aria-label="About ${metric.label}"]`),
      });
      const amount = card.locator("dd").first();
      await expect(amount).toHaveText(metric.amount);
      await expect(amount).toBeVisible();
      expect(
        await amount.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (viewport.width < 1024) {
      const menu = page.getByRole("button", { name: "Open navigation menu", exact: true });
      await menu.click();
      await expect(page.getByRole("link", { name: "Portfolio", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    }
    await page.screenshot({
      path: testInfo.outputPath(`portfolio-summary-${viewport.name}.png`),
      fullPage: true,
    });
  });
}

test("protects summary content during session verification and redirects guests", async ({
  page,
}) => {
  let releaseRefresh: () => void = () => {};
  const pendingRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/auth/refresh", async (route) => {
    await pendingRefresh;
    await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });

  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Checking your session" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Portfolio summary", exact: true })).toHaveCount(0);
  releaseRefresh();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fportfolio$/);
  await expect(page.getByRole("region", { name: "Portfolio summary", exact: true })).toHaveCount(0);
});
