import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import test from "node:test";

test("production entrypoint reports invalid configuration as safe JSON and exits nonzero", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pulse-trade-p05-startup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const secret = "P05_PRIVATE_ENV_CONFIGURATION";
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../dist/main.js", import.meta.url))],
    {
      cwd: directory,
      env: { ...process.env, NODE_ENV: secret },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  const records = result.stderr
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(records.length, 1);
  assert.equal(records[0].event, "application.start_failed");
  assert.equal(records[0].level, "fatal");
  assert.ok(records[0].error.stack.includes("dist/config/configuration.js"));
  assert.equal((result.stdout + result.stderr).includes(secret), false);
  assert.equal(records[0].requestId, undefined);
});
