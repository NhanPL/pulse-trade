import { expect, test, type Page } from "@playwright/test";

async function fillForm(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill(" User@Example.com ");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("test-password");
}

test("desktop follows the auth layout and keyboard validation never sends invalid data", async ({
  page,
}, testInfo) => {
  let requests = 0;
  await page.route("**/auth/register", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("/register");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await expect(page.getByText("$10,000 virtual USD", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Account", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("register-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await fillForm(page);
  await page.getByLabel("Confirm password", { exact: true }).fill("different-password");
  await page.getByLabel("Confirm password", { exact: true }).press("Enter");
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Show password", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
});

test("mobile has no horizontal overflow and keeps all form controls reachable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/register");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Create Account", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Create Account", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("register-mobile.png"), fullPage: true });
});

test("email and password boundaries are validated before calling the API", async ({ page }) => {
  let requests = 0;
  await page.route("**/auth/register", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("/register");
  await fillForm(page);
  const submit = page.getByRole("button", { name: "Create Account", exact: true });
  await page.getByLabel("Email", { exact: true }).fill("not-an-email");
  await submit.click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("user@example.com");
  for (const password of ["short", "p".repeat(129)]) {
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await submit.click();
    await expect(page.getByText("Use a password between 8 and 128 characters.")).toBeVisible();
  }
  expect(requests).toBe(0);
});

test("pending submission sends only normalized credentials once, then displays success", async ({
  page,
}) => {
  let requests = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/register", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      email: "user@example.com",
      password: "test-password",
    });
    await pending;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: { user: { id: "123e4567-e89b-42d3-a456-426614174000", email: "user@example.com" } },
      }),
    });
  });
  await page.goto("/register");
  await fillForm(page);
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Creating account…" })).toBeDisabled();
  await page.getByLabel("Confirm password", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Creating account…" })).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(page.getByRole("heading", { name: "Your account is ready" })).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute(
    "href",
    "/login?registered=1",
  );
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("recoverable errors preserve inputs and allow retry without exposing server details", async ({
  page,
}) => {
  let attempt = 0;
  await page.route("**/auth/register", async (route) => {
    attempt++;
    if (attempt === 3) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: attempt === 1 ? 409 : attempt === 2 ? 429 : 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: attempt === 1 ? "EMAIL_ALREADY_REGISTERED" : "REGISTRATION_UNAVAILABLE",
          message: "sensitive internal database detail",
        },
      }),
    });
  });
  await page.goto("/register");
  await fillForm(page);
  const submit = page.getByRole("button", { name: "Create Account", exact: true });
  for (const message of [
    "An account with this email already exists.",
    "Too many attempts.",
    "We couldn't confirm registration.",
    "Registration is temporarily unavailable.",
  ]) {
    await submit.click();
    await expect(page.locator("form").getByRole("alert")).toContainText(message);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("test-password");
    await expect(submit).toBeEnabled();
    await expect(page.getByText("sensitive internal database detail")).toHaveCount(0);
  }
});

test("malformed success payload never claims the account was created", async ({ page }) => {
  await page.route("**/auth/register", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/register");
  await fillForm(page);
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Your account may have been created",
  );
  await expect(page.getByRole("heading", { name: "Your account is ready" })).toHaveCount(0);
});
