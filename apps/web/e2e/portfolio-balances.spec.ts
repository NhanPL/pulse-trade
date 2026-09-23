import { expect, test, type Page } from "@playwright/test";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", email: "trader@example.com" };
const session = {
  data: {
    user,
    accessToken: "synthetic-portfolio-balances-token",
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
  { label: "USD Available", amount: "$18,642.30", percentage: "(100.00%)" },
  { label: "USD Locked", amount: "$0.00", percentage: "(0.00%)" },
  { label: "Total (USD)", amount: "$18,642.30", percentage: null },
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
  await page.route("**/api/v1/portfolio**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(portfolio),
    }),
  );
}

test("shows separate account available and locked USD with a consistent cash total", async ({
  page,
}) => {
  await mockAuthenticatedSession(page);

  await page.goto("/portfolio");
  const balances = page.getByRole("region", { name: "Cash balances", exact: true });
  await expect(
    balances.getByRole("heading", { name: "Balances (USD)", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Paper account", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Balances and positions come from your account. Market prices update live.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(balances.locator("dl > div")).toHaveCount(3);

  for (const metric of metrics) {
    const row = balances.locator("dl > div").filter({
      has: page.locator(`summary[aria-label="About ${metric.label}"]`),
    });
    await expect(row.locator("dt")).toContainText(metric.label);
    await expect(row.locator("dd").first()).toContainText(metric.amount);
    if (metric.percentage) {
      await expect(row.getByText(metric.percentage, { exact: true })).toBeVisible();
    }
  }

  const summary = page.getByRole("region", { name: "Portfolio summary", exact: true });
  const cashSummary = summary.locator("dl > div").filter({
    has: page.locator('summary[aria-label="About Cash Balance"]'),
  });
  const total = balances.locator("dl > div").filter({
    has: page.locator('summary[aria-label="About Total (USD)"]'),
  });
  await expect(total.locator("dd").first()).toHaveText(
    (await cashSummary.locator("dd").first().innerText()).trim(),
  );
  const allocation = balances.getByRole("figure", {
    name: "100% of virtual USD cash available",
    exact: true,
  });
  await expect(allocation).toBeVisible();
  await expect(allocation.getByText("100%", { exact: true })).toBeVisible();
  await expect(allocation.getByText("Available", { exact: true })).toBeVisible();
});

test("balance explanations support keyboard disclosure on desktop and small mobile", async ({
  page,
}) => {
  await mockAuthenticatedSession(page);
  await page.goto("/portfolio");
  const balances = page.getByRole("region", { name: "Cash balances", exact: true });

  for (const width of [1586, 320]) {
    await page.setViewportSize({ width, height: 992 });
    for (const metric of metrics) {
      const help = balances.locator(`summary[aria-label="About ${metric.label}"]`);
      const disclosure = help.locator("..");
      await expect(help).toBeVisible();
      await expect(disclosure).not.toHaveAttribute("open");
      await help.focus();
      await expect(help).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(disclosure.locator("p")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.keyboard.press("Space");
      await expect(disclosure).not.toHaveAttribute("open");
      await expect(disclosure.locator("p")).toBeHidden();
    }
  }
});

for (const viewport of [
  { name: "desktop", width: 1586, height: 992, stacked: false, inlineRing: true },
  { name: "compact-desktop", width: 1024, height: 768, stacked: false, inlineRing: true },
  { name: "tablet", width: 768, height: 1024, stacked: false, inlineRing: false },
  { name: "mobile", width: 360, height: 800, stacked: true, inlineRing: false },
  { name: "small-mobile", width: 320, height: 800, stacked: true, inlineRing: false },
]) {
  test(`cash balances remain readable in the ${viewport.name} layout`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAuthenticatedSession(page);
    await page.goto("/portfolio");
    const balances = page.getByRole("region", { name: "Cash balances", exact: true });
    await expect(balances).toBeVisible();
    const figures = balances.locator("dl > div");
    await expect(figures).toHaveCount(3);
    const rectangles = await figures.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
        return { x, y, width, height, right, bottom };
      }),
    );

    for (let index = 1; index < rectangles.length; index++) {
      const rectangle = rectangles[index]!;
      const previous = rectangles[index - 1]!;
      if (viewport.stacked) {
        expect(rectangle.y).toBeGreaterThanOrEqual(previous.bottom);
        expect(Math.abs(rectangle.x - previous.x)).toBeLessThan(1);
      } else {
        expect(Math.abs(rectangle.y - previous.y)).toBeLessThan(1);
        expect(rectangle.x).toBeGreaterThanOrEqual(previous.right);
      }
    }
    const allocation = balances.getByRole("figure", {
      name: "100% of virtual USD cash available",
      exact: true,
    });
    await expect(allocation).toBeVisible();
    const ring = await allocation.boundingBox();
    expect(ring).not.toBeNull();
    if (viewport.inlineRing) {
      expect(ring!.x).toBeGreaterThanOrEqual(rectangles[2]!.right);
      expect(ring!.y).toBeLessThan(rectangles[0]!.bottom);
      expect(ring!.y + ring!.height).toBeGreaterThan(rectangles[0]!.y);
    } else {
      expect(ring!.y).toBeGreaterThanOrEqual(
        Math.max(...rectangles.map((rectangle) => rectangle.bottom)),
      );
    }
    for (const metric of metrics) {
      const row = figures.filter({
        has: page.locator(`summary[aria-label="About ${metric.label}"]`),
      });
      const amount = row.locator("dd").first();
      await expect(amount).toContainText(metric.amount);
      await expect(amount).toBeVisible();
      expect(
        await amount.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`portfolio-balances-${viewport.name}.png`),
      fullPage: true,
    });
  });
}

test("protects cash balances during session verification and redirects guests", async ({
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
  await expect(page.getByRole("region", { name: "Cash balances", exact: true })).toHaveCount(0);
  releaseRefresh();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fportfolio$/);
  await expect(page.getByRole("region", { name: "Cash balances", exact: true })).toHaveCount(0);
});
