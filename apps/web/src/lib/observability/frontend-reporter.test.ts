import { describe, expect, it, vi } from "vitest";

import {
  createFrontendErrorEvent,
  FrontendErrorReporter,
  installBrowserErrorListeners,
  MAX_REPORTS_PER_WINDOW,
  reportingPage,
  sanitizeSdkErrorEvent,
  REPORT_WINDOW_MS,
} from "./frontend-reporter";
import { publicSentryDsnSchema, reportingReleaseSchema } from "./reporting-config";

const location = () => ({ origin: "https://app.example", pathname: "/trade/BTC-USD" });

function bundleError(line = 12): Error {
  const error = new TypeError(
    "password=test-secret Bearer test-token user@example.com quantity=1000",
  );
  error.stack = `TypeError: ${error.message}\n    at test-secret (https://app.example/_next/static/chunks/app-123.js?token=test-token:${line}:34)\n    at private (https://external.example/user@example.com.js:1:2)\n    at user (https://app.example/api/orders/user@example.com:3:4)`;
  return error;
}

describe("P04 private, bounded frontend reports", () => {
  it("rebuilds the final SDK event rather than forwarding unexpected nested data", () => {
    const event = createFrontendErrorEvent(
      "chart_error",
      bundleError(),
      "/trade/BTC-USD",
      location().origin,
    );
    const safe = sanitizeSdkErrorEvent({
      ...event,
      tags: { ...event.tags, token: "private-token" },
      fingerprint: ["private-token"],
      exception: {
        values: [
          {
            ...event.exception?.values?.[0],
            value: "private-token",
            mechanism: { type: "private-token", data: { token: "private-token" } },
            stacktrace: {
              frames: [
                {
                  filename: "/_next/static/chunks/app.js",
                  lineno: 1,
                  colno: 2,
                  function: "private-token",
                  vars: { password: "private-token" },
                  context_line: "private-token",
                },
              ],
            },
          },
        ],
      },
      user: { email: "private-token" },
    });
    expect(JSON.stringify(safe)).not.toContain("private-token");
    expect(safe?.tags).toEqual({ kind: "chart_error", page: "trade" });
    expect(sanitizeSdkErrorEvent({ type: undefined, tags: { kind: "constructor" } })).toBeNull();
    expect(sanitizeSdkErrorEvent({ type: undefined })).toBeNull();
  });

  it("keeps only own bundle coordinates and fixed error/page labels", () => {
    const event = createFrontendErrorEvent(
      "uncaught_error",
      bundleError(),
      "/trade/private-email",
      location().origin,
    );
    expect(event.tags).toEqual({ kind: "uncaught_error", page: "trade" });
    expect(event.exception?.values).toEqual([
      {
        type: "TypeError",
        value: "Uncaught frontend error",
        stacktrace: {
          frames: [
            { filename: "/_next/static/chunks/app-123.js", lineno: 12, colno: 34, in_app: true },
          ],
        },
      },
    ]);
    const serialized = JSON.stringify(event);
    for (const secret of [
      "password",
      "test-secret",
      "test-token",
      "user@example.com",
      "quantity",
      "private-email",
      "app.example",
      "external.example",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("drops arbitrary rejection values, custom error names and non-bundle stack frames", () => {
    const custom = new Error("secret");
    custom.name = "secret-token";
    expect(
      createFrontendErrorEvent("route_error", custom, "/private/id", location().origin).exception
        ?.values?.[0]?.type,
    ).toBe("FrontendError");
    const event = createFrontendErrorEvent(
      "unhandled_rejection",
      { cookie: "secret-cookie", email: "user@example.com" },
      "/login",
      location().origin,
    );
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(event.tags?.page).toBe("login");
    const huge = new Error("secret");
    huge.stack =
      "Error: secret\n" +
      Array.from(
        { length: 100 },
        (_, index) => `at private (https://app.example/_next/static/chunks/app.js:${index + 1}:2)`,
      ).join("\n");
    expect(
      createFrontendErrorEvent("chart_error", huge, "/", location().origin).exception?.values?.[0]
        ?.stacktrace?.frames,
    ).toHaveLength(10);
  });

  it("normalizes every product route without retaining identifiers or queries", () => {
    expect(
      [
        "/",
        "/login",
        "/register",
        "/portfolio",
        "/orders",
        "/watchlist",
        "/trade/private",
        "/private",
      ].map(reportingPage),
    ).toEqual([
      "markets",
      "login",
      "register",
      "portfolio",
      "orders",
      "watchlist",
      "trade",
      "other",
    ]);
  });

  it("deduplicates error objects across boundaries and repeated fingerprints within one minute", () => {
    const sink = vi.fn();
    let now = REPORT_WINDOW_MS;
    const reporter = new FrontendErrorReporter(sink, location, () => now);
    const error = bundleError();
    reporter.report("uncaught_error", error);
    reporter.report("route_error", error);
    reporter.report("uncaught_error", bundleError());
    expect(sink).toHaveBeenCalledTimes(1);
    now += REPORT_WINDOW_MS;
    reporter.report("uncaught_error", bundleError());
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("caps unique reports and retained fingerprints during a flood, then allows the next minute", () => {
    const sink = vi.fn();
    let now = REPORT_WINDOW_MS;
    const reporter = new FrontendErrorReporter(sink, location, () => now);
    for (let index = 0; index < 10_000; index++)
      reporter.report("uncaught_error", bundleError(index + 1));
    expect(sink).toHaveBeenCalledTimes(MAX_REPORTS_PER_WINDOW);
    now += REPORT_WINDOW_MS;
    reporter.report("uncaught_error", bundleError(10001));
    expect(sink).toHaveBeenCalledTimes(MAX_REPORTS_PER_WINDOW + 1);
  });

  it("isolates synchronous, asynchronous and malformed-error failures without recursion", async () => {
    const throwing = new FrontendErrorReporter(() => {
      throw new Error("collector offline");
    }, location);
    expect(() => throwing.report("chart_error", bundleError())).not.toThrow();
    const rejecting = new FrontendErrorReporter(
      () => Promise.reject(new Error("collector offline")),
      location,
    );
    rejecting.report("chart_error", bundleError());
    await Promise.resolve();
    const hostile = new Error();
    Object.defineProperty(hostile, "stack", {
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(() => rejecting.report("uncaught_error", hostile)).not.toThrow();
  });

  it("installs and cleans up both global listeners without changing browser error behavior", () => {
    const report = vi.fn();
    const stop = installBrowserErrorListeners(window, { report });
    const error = new Error("synthetic");
    const event = new window.ErrorEvent("error", { error, cancelable: true });
    // Prevent jsdom's own error logging while leaving reporting's behavior observable.
    const prevent = (event: Event) => event.preventDefault();
    window.addEventListener("error", prevent);
    window.dispatchEvent(event);
    const rejection = new Event("unhandledrejection", { cancelable: true });
    Object.defineProperty(rejection, "reason", { value: error });
    window.dispatchEvent(rejection);
    expect(rejection.defaultPrevented).toBe(false);
    expect(report.mock.calls).toEqual([
      ["uncaught_error", error],
      ["unhandled_rejection", error],
    ]);
    stop();
    stop();
    window.dispatchEvent(rejection);
    expect(report).toHaveBeenCalledTimes(2);
    window.removeEventListener("error", prevent);
  });

  it("accepts only optional public HTTPS DSNs and short non-sensitive build labels", () => {
    expect(publicSentryDsnSchema.safeParse(undefined).success).toBe(true);
    expect(
      publicSentryDsnSchema.safeParse(
        "https://00000000000000000000000000000001@o1.ingest.sentry.io/123",
      ).success,
    ).toBe(true);
    for (const dsn of [
      "secret-auth-token",
      "http://00000000000000000000000000000001@host/1",
      "https://00000000000000000000000000000001:secret@host/1",
      "https://00000000000000000000000000000001@host/1?token=secret",
      "https://00000000000000000000000000000001@host/path",
    ]) {
      expect(publicSentryDsnSchema.safeParse(dsn).success).toBe(false);
    }
    expect(reportingReleaseSchema.safeParse("6c07a32").success).toBe(true);
    expect(reportingReleaseSchema.safeParse("user@example.com").success).toBe(false);
  });
});
