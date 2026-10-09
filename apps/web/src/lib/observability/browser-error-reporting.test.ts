import type { BrowserClient } from "@sentry/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  captureEvent: vi.fn(),
  init: vi.fn(),
  setClient: vi.fn(),
}));

vi.mock("@sentry/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/browser")>()),
  BrowserClient: class {
    constructor(options: ConstructorParameters<typeof BrowserClient>[0]) {
      mocks.createClient(options);
    }
    init = mocks.init;
  },
  Scope: class {
    captureEvent = mocks.captureEvent;
    setClient = mocks.setClient;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://00000000000000000000000000000001@localhost/1");
  vi.stubEnv("NEXT_PUBLIC_APP_RELEASE", "unit-p04");
  vi.spyOn(window, "addEventListener").mockImplementation(() => undefined);
});

describe("P04 opt-in isolated Sentry client", () => {
  it("does not initialize in development or send captured errors", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const reporting = await import("./browser-error-reporting");
    reporting.reportFrontendError("route_error", new Error("private"));
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.captureEvent).not.toHaveBeenCalled();
  });

  it("does not initialize without a DSN in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const reporting = await import("./browser-error-reporting");
    reporting.reportFrontendError("root_error", new Error("private"));
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it("does not initialize during server rendering", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", undefined);
    const reporting = await import("./browser-error-reporting");
    expect(() => reporting.reportFrontendError("route_error")).not.toThrow();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("initializes once without automatic collection and strips SDK-added context before sending", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const reporting = await import("./browser-error-reporting");
    reporting.initializeFrontendErrorReporting();
    reporting.initializeFrontendErrorReporting();
    reporting.reportFrontendError("route_error", new Error("private-token"));
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(window.addEventListener).toHaveBeenCalledTimes(2);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.captureEvent).toHaveBeenCalledTimes(1);
    const options: ConstructorParameters<typeof BrowserClient>[0] =
      mocks.createClient.mock.calls[0]![0];
    expect(options.integrations).toEqual([]);
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    });
    expect(options.sendClientReports).toBe(false);
    const event = mocks.captureEvent.mock.calls[0]![0];
    const sanitized = options.beforeSend?.(
      {
        ...event,
        tags: { ...event.tags, email: "private-email" },
        user: { email: "private-email" },
        request: {
          url: "https://app.example/?token=private-token",
          headers: { cookie: "private-cookie" },
        },
        extra: { password: "private-password" },
        contexts: { trace: { trace_id: "private" } },
        breadcrumbs: [{ message: "private-password" }],
      },
      {},
    );
    expect(JSON.stringify(sanitized)).not.toContain("private");
    expect(sanitized).toMatchObject({
      environment: "production",
      release: "unit-p04",
      tags: { kind: "route_error" },
    });
  });

  it("keeps the application usable when SDK initialization fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.createClient.mockImplementationOnce(() => {
      throw new Error("collector unavailable");
    });
    const reporting = await import("./browser-error-reporting");
    expect(() => reporting.reportFrontendError("root_error", new Error("private"))).not.toThrow();
    expect(mocks.captureEvent).not.toHaveBeenCalled();
  });
});
