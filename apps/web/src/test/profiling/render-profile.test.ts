import { describe, expect, it } from "vitest";

import { RenderProfile } from "./render-profile";

describe("test-only render profile collector", () => {
  it("excludes mounts and distinguishes subtree commits from function calls", () => {
    const profile = new RenderProfile();
    profile.onRender("price", "mount", 10, 12, 0, 0);
    profile.onRender("price", "update", 2, 3, 1, 1);
    profile.onRender("price", "nested-update", 4, 5, 2, 2);
    profile.recordCall("header");
    expect(profile.report(["price", "header", "absent"])).toEqual([
      {
        id: "price",
        commits: 2,
        functionCalls: null,
        totalActualMs: 6,
        maxActualMs: 4,
        lastBaseMs: 5,
      },
      {
        id: "header",
        commits: 0,
        functionCalls: 1,
        totalActualMs: 0,
        maxActualMs: 0,
        lastBaseMs: 0,
      },
      {
        id: "absent",
        commits: 0,
        functionCalls: null,
        totalActualMs: 0,
        maxActualMs: 0,
        lastBaseMs: 0,
      },
    ]);
  });

  it("resets startup measurements and prior workloads", () => {
    const profile = new RenderProfile();
    profile.onRender("price", "update", 1, 1, 0, 0);
    profile.recordCall("header");
    profile.reset();
    expect(profile.commits("price")).toBe(0);
    expect(profile.functionCalls("header")).toBe(0);
    expect(profile.report(["header"])[0]?.functionCalls).toBe(0);
  });
});
