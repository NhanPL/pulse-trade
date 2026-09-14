import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { loadRuntimeEnvironment } = require("../dist/config/runtime-environment.js");

function restoreEnvironmentValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

test("loads the API environment file without replacing deployment values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pulse-trade-api-env-"));
  const envPath = join(directory, ".env");
  const suffix = randomUUID().replaceAll("-", "");
  const fileOnlyKey = `PULSE_TRADE_FILE_ONLY_${suffix}`;
  const runtimeKey = `PULSE_TRADE_RUNTIME_${suffix}`;
  const originalFileOnlyValue = process.env[fileOnlyKey];
  const originalRuntimeValue = process.env[runtimeKey];

  try {
    await writeFile(envPath, `${fileOnlyKey}=from-file\n${runtimeKey}=from-file\n`);
    delete process.env[fileOnlyKey];
    process.env[runtimeKey] = "from-runtime";

    loadRuntimeEnvironment(envPath);

    assert.equal(process.env[fileOnlyKey], "from-file");
    assert.equal(process.env[runtimeKey], "from-runtime");
  } finally {
    restoreEnvironmentValue(fileOnlyKey, originalFileOnlyValue);
    restoreEnvironmentValue(runtimeKey, originalRuntimeValue);
    await rm(directory, { force: true, recursive: true });
  }
});
