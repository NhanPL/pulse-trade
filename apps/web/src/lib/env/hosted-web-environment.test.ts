import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateHostedWebEnvironment } from "./hosted-web-environment";

const validEndpoints = {
  NEXT_PUBLIC_API_URL: "https://api.example.test/api/v1",
  NEXT_PUBLIC_WS_URL: "wss://api.example.test/realtime",
};

describe("P09 hosted web endpoint validation", () => {
  it("accepts explicit secure API and gateway endpoints", () => {
    expect(() => validateHostedWebEnvironment(validEndpoints)).not.toThrow();
  });

  it.each(["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_WS_URL"] as const)(
    "requires %s rather than silently shipping a local default",
    (field) => {
      for (const value of [undefined, "", "not-a-url"]) {
        expect(() => validateHostedWebEnvironment({ ...validEndpoints, [field]: value })).toThrow(
          field,
        );
      }
    },
  );

  it.each([
    "http://api.example.test/api/v1",
    "ftp://api.example.test/api/v1",
    "wss://api.example.test/api/v1",
    "https://api.example.test",
    "https://api.example.test/api/v1/",
    "https://api.example.test/api/v2",
    "https://api.example.test/api/v1?token=private-query",
    "https://api.example.test/api/v1#fragment",
    "https://private-user:private-password@api.example.test/api/v1",
  ])("rejects an invalid API endpoint: %s", (NEXT_PUBLIC_API_URL) => {
    expect(() => validateHostedWebEnvironment({ ...validEndpoints, NEXT_PUBLIC_API_URL })).toThrow(
      "NEXT_PUBLIC_API_URL",
    );
  });

  it.each([
    "ws://api.example.test/realtime",
    "https://api.example.test/realtime",
    "wss://api.example.test",
    "wss://api.example.test/realtime/",
    "wss://api.example.test/socket.io",
    "wss://api.example.test/realtime?token=private-query",
    "wss://api.example.test/realtime#fragment",
    "wss://private-user:private-password@api.example.test/realtime",
  ])("rejects an invalid WebSocket endpoint: %s", (NEXT_PUBLIC_WS_URL) => {
    expect(() => validateHostedWebEnvironment({ ...validEndpoints, NEXT_PUBLIC_WS_URL })).toThrow(
      "NEXT_PUBLIC_WS_URL",
    );
  });

  it.each([
    "localhost",
    "localhost.",
    "api.localhost",
    "api.localhost.",
    "api.local",
    "127.0.0.1",
    "127.2.3.4",
    "0.0.0.0",
    "[::1]",
    "[::]",
  ])("rejects local endpoints even with TLS: %s", (host) => {
    expect(() =>
      validateHostedWebEnvironment({
        ...validEndpoints,
        NEXT_PUBLIC_API_URL: `https://${host}/api/v1`,
      }),
    ).toThrow("NEXT_PUBLIC_API_URL");
    expect(() =>
      validateHostedWebEnvironment({
        ...validEndpoints,
        NEXT_PUBLIC_WS_URL: `wss://${host}/realtime`,
      }),
    ).toThrow("NEXT_PUBLIC_WS_URL");
  });

  it("does not echo credentials or query values in a build error", () => {
    let message = "";
    try {
      validateHostedWebEnvironment({
        NEXT_PUBLIC_API_URL: "https://private-user:private-password@api.example.test/api/v1",
        NEXT_PUBLIC_WS_URL: "wss://api.example.test/realtime?token=private-token",
      });
    } catch (error) {
      if (error instanceof Error) message = error.message;
    }
    expect(message).toContain("NEXT_PUBLIC_API_URL");
    expect(message).toContain("NEXT_PUBLIC_WS_URL");
    expect(message).not.toContain("private-");
    expect(message).not.toContain("api.example.test");
  });
});

describe("P09 Next configuration guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_WS_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_APP_RELEASE", "");
  });

  it("keeps local defaults usable, including local production/E2E builds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("../../../next.config")).resolves.toMatchObject({
      default: { agentRules: false },
    });
    const { webEnvironment } = await import("./server");
    expect(webEnvironment.NEXT_PUBLIC_API_URL).toBe("http://localhost:3001/api/v1");
    expect(webEnvironment.NEXT_PUBLIC_WS_URL).toBe("ws://localhost:3001/realtime");
  });

  it("rejects missing hosted endpoint values when Next loads its configuration", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(import("../../../next.config")).rejects.toThrow("Invalid hosted web environment");
  });

  it("rejects explicit loopback values in hosted builds", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://localhost/api/v1");
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://localhost/realtime");
    await expect(import("../../../next.config")).rejects.toThrow("Invalid hosted web environment");
  });

  it("accepts secure values for hosted builds without changing the public configuration", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXT_PUBLIC_API_URL", validEndpoints.NEXT_PUBLIC_API_URL);
    vi.stubEnv("NEXT_PUBLIC_WS_URL", validEndpoints.NEXT_PUBLIC_WS_URL);
    await expect(import("../../../next.config")).resolves.toBeDefined();
    const { webEnvironment } = await import("./server");
    expect(webEnvironment.NEXT_PUBLIC_API_URL).toBe(validEndpoints.NEXT_PUBLIC_API_URL);
    expect(webEnvironment.NEXT_PUBLIC_WS_URL).toBe(validEndpoints.NEXT_PUBLIC_WS_URL);
  });
});
