import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-portfolio-holdings-token",
    tokenType: "Bearer",
    expiresIn: 900,
    session: { id: "123e4567-e89b-42d3-a456-426614174001", expiresAt: "2099-01-01T00:00:00.000Z" },
  },
};
const portfolio = {
  data: {
    cash: { available: "18642.30", locked: "0.00" },
    positions: [
      { asset: "BTC", averageCost: "61450", quantity: "0.35", realizedPnl: "0" },
      { asset: "ETH", averageCost: "3102.5", quantity: "2.5", realizedPnl: "0" },
      { asset: "SOL", averageCost: "142.5", quantity: "15", realizedPnl: "0" },
      { asset: "ADA", averageCost: "0.452", quantity: "10000", realizedPnl: "0" },
    ],
    quoteCurrency: "USD",
  },
};

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
  await page.route("**/api/v1/portfolio**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(portfolio),
    }),
  );
}

test("desktop account holdings keep the evidence hierarchy before the first ticker", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1586, height: 992 });
  await mockAuthenticatedSession(page);

  await page.goto("/portfolio");
  const holdings = page.getByRole("region", { name: "Holdings", exact: true });
  const table = holdings.getByRole("table", { name: "Holdings table", exact: true });
  await expect(holdings.getByRole("heading", { name: "Holdings", exact: true })).toBeVisible();
  await expect(table).toBeVisible();
  await expect(holdings.getByRole("list", { name: "Holdings cards", exact: true })).toBeHidden();
  await expect(table.locator("tbody > tr")).toHaveCount(4);

  const bitcoin = table.getByRole("row", { name: /BTC Bitcoin/ });
  await expect(bitcoin).toContainText("0.350000");
  await expect(bitcoin).toContainText("$61,450.00");
  await expect(bitcoin.getByLabel("Current price unavailable")).toBeVisible();
  await expect(bitcoin.getByLabel("Unrealized profit and loss not available")).toBeVisible();
  await expect(
    bitcoin.getByRole("link", { name: "Open BTC-USD trading workspace" }),
  ).toHaveAttribute("href", "/trade/BTC-USD");

  const cardano = table.getByRole("row", { name: /ADA Cardano/ });
  await expect(cardano).toContainText("10,000.000000");
  await expect(cardano).toContainText("$0.4520");
  await expect(holdings.getByText("Total Market Value", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("portfolio-holdings-desktop.png"),
    fullPage: true,
  });
});

test("holdings controls are keyboard accessible and search both symbol and asset name", async ({
  page,
}) => {
  await mockAuthenticatedSession(page);
  await page.goto("/portfolio");
  const holdings = page.getByRole("region", { name: "Holdings", exact: true });
  const table = holdings.getByRole("table", { name: "Holdings table", exact: true });
  const toggle = holdings.getByRole("switch", { name: "Hide Small Balances", exact: true });
  const search = holdings.getByRole("searchbox", { name: "Search holdings", exact: true });

  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await search.fill("solana");
  await expect(table.locator("tbody > tr")).toHaveCount(1);
  await expect(table.getByRole("row", { name: /SOL Solana/ })).toBeVisible();
  await search.fill("ada");
  await expect(table.locator("tbody > tr")).toHaveCount(1);
  await expect(table.getByRole("row", { name: /ADA Cardano/ })).toBeVisible();
  await search.fill("missing");
  await expect(holdings.getByText("No matching holdings", { exact: true })).toBeVisible();
});

for (const viewport of [
  { name: "tablet", width: 768, height: 1024, columns: 2 },
  { name: "mobile", width: 360, height: 800, columns: 1 },
  { name: "small-mobile", width: 320, height: 800, columns: 1 },
]) {
  test(`holdings use readable ${viewport.name} cards`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAuthenticatedSession(page);
    await page.goto("/portfolio");
    const holdings = page.getByRole("region", { name: "Holdings", exact: true });
    const cards = holdings.getByRole("list", { name: "Holdings cards", exact: true });
    await expect(cards).toBeVisible();
    await expect(holdings.getByRole("table", { name: "Holdings table", exact: true })).toBeHidden();
    await expect(cards.locator(":scope > li")).toHaveCount(4);

    const rectangles = await cards.locator(":scope > li").evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, right, bottom } = element.getBoundingClientRect();
        return { x, y, right, bottom };
      }),
    );
    if (viewport.columns === 2) {
      expect(Math.abs(rectangles[0]!.y - rectangles[1]!.y)).toBeLessThan(1);
      expect(rectangles[1]!.x).toBeGreaterThanOrEqual(rectangles[0]!.right);
    } else {
      for (let index = 1; index < rectangles.length; index++) {
        expect(rectangles[index]!.y).toBeGreaterThanOrEqual(rectangles[index - 1]!.bottom);
      }
    }
    await expect(cards.getByText("Current Price (USD)").first()).toBeVisible();
    await expect(cards.getByText("Unrealized P&L (USD)").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await page.screenshot({
      path: testInfo.outputPath(`portfolio-holdings-${viewport.name}.png`),
      fullPage: true,
    });
  });
}
