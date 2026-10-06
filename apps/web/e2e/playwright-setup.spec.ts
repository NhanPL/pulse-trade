import { expect, test } from "@playwright/test";

test("Chromium reaches the production app using the configured base URL and viewport", async ({
  browser,
  page,
}) => {
  expect(browser.browserType().name()).toBe("chromium");
  expect(page.viewportSize()).toEqual({ width: 1586, height: 992 });
  const refreshRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/v1/auth/refresh"),
  );
  await page.route("**/api/v1/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/register");
  expect((await refreshRequest).url()).toBe("http://localhost:3100/api/v1/auth/refresh");
  await expect(page).toHaveURL("http://localhost:3100/register");
  await expect(
    page.getByRole("heading", { name: "Create your account", exact: true }),
  ).toBeVisible();
});

// Both tests write the same key; either would fail if the runner reused browser state.
for (const name of ["first", "second"]) {
  test(`${name} browser context isolates cookies and storage from other tests`, async ({
    context,
    page,
  }) => {
    expect(await context.cookies()).toEqual([]);
    await page.goto("/register");
    expect(
      await page.evaluate(() => localStorage.getItem("playwright-isolation-probe")),
    ).toBeNull();
    expect(
      await page.evaluate(() => sessionStorage.getItem("playwright-isolation-probe")),
    ).toBeNull();
    await page.evaluate(() => {
      localStorage.setItem("playwright-isolation-probe", "test-only");
      sessionStorage.setItem("playwright-isolation-probe", "test-only");
    });
    await context.addCookies([
      { name: "playwright-isolation-probe", value: "test-only", url: "http://localhost:3100" },
    ]);
    expect(
      (await context.cookies()).some((cookie) => cookie.name === "playwright-isolation-probe"),
    ).toBe(true);
  });
}
