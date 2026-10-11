// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import rootPackage from "../../../../../package.json";
import webPackage from "../../../package.json";
import vercelConfiguration from "../../../vercel.json";

describe("P09 Vercel workspace deployment configuration", () => {
  it("builds contracts before web without building or migrating the API", () => {
    expect(rootPackage.scripts["build:web"]).toBe(
      "pnpm --filter @pulse-trade/contracts build && pnpm --filter @pulse-trade/web build",
    );
    expect(vercelConfiguration.buildCommand).toBe(
      `cd ../.. && VERCEL=1 NEXT_TELEMETRY_DISABLED=1 npx --yes ${rootPackage.packageManager} build:web`,
    );
  });

  it("pins pnpm, freezes the workspace lockfile and includes build dependencies", () => {
    expect(vercelConfiguration.installCommand).toBe(
      `cd ../.. && npx --yes ${rootPackage.packageManager} --filter @pulse-trade/web... install --frozen-lockfile --prod=false`,
    );
    expect(webPackage.engines.node).toBe("24.x");
    expect(webPackage.dependencies["@pulse-trade/contracts"]).toBe("workspace:*");
  });

  it("uses native Next.js routing rather than static export or an API/WebSocket proxy", () => {
    expect(Object.keys(vercelConfiguration).sort()).toEqual([
      "$schema",
      "buildCommand",
      "framework",
      "installCommand",
    ]);
    expect(vercelConfiguration.framework).toBe("nextjs");
  });

  it("excludes local Vercel project and environment artifacts from Git", () => {
    const gitignore = readFileSync(
      fileURLToPath(new URL("../../../../../.gitignore", import.meta.url)),
      "utf8",
    );
    expect(gitignore.split(/\r?\n/)).toContain(".vercel/");
  });
});
