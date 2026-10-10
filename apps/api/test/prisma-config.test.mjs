import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { URL } from "node:url";

const configUrl = new URL("../prisma.config.ts", import.meta.url).href;
const pooled = "postgresql://user:fixture@runtime-pooler.example/app";
const direct = "postgresql://user:fixture@migration.example/app";
const isolated = "postgresql://user:fixture@localhost/app_test";

function loadConfig(t, values, file = "") {
  const directory = mkdtempSync(join(tmpdir(), "pulse-trade-prisma-config-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  if (file) writeFileSync(join(directory, ".env"), file);
  const environment = { ...process.env };
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "NODE_ENV"]) {
    delete environment[key];
  }
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const { default: config } = await import(${JSON.stringify(configUrl)});
       console.log(JSON.stringify({ url: config.datasource?.url ?? null,
         runtime: process.env.DATABASE_URL ?? null }));`,
    ],
    { cwd: directory, env: { ...environment, ...values }, encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, "Prisma configuration should load without a database");
  return JSON.parse(result.stdout);
}

test("migrations select the direct URL without changing the runtime pooled URL", (t) => {
  assert.deepEqual(
    loadConfig(t, { NODE_ENV: "production", DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct }),
    { url: direct, runtime: pooled },
  );
});

test("local migrations remain compatible with only DATABASE_URL", (t) => {
  assert.deepEqual(loadConfig(t, { DATABASE_URL: pooled }), { url: pooled, runtime: pooled });
});

test("deployment variables take precedence over the API .env file", (t) => {
  assert.deepEqual(
    loadConfig(
      t,
      { NODE_ENV: "production", DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct },
      "DATABASE_URL=postgresql://localhost/development\nDATABASE_URL_UNPOOLED=postgresql://localhost/development",
    ),
    { url: direct, runtime: pooled },
  );
});

test("local API .env can supply separate runtime and migration URLs", (t) => {
  assert.deepEqual(loadConfig(t, {}, `DATABASE_URL=${pooled}\nDATABASE_URL_UNPOOLED=${direct}`), {
    url: direct,
    runtime: pooled,
  });
});

test("test migrations ignore inherited production direct URLs and never load .env", (t) => {
  assert.deepEqual(
    loadConfig(
      t,
      { NODE_ENV: "test", DATABASE_URL: isolated, DATABASE_URL_UNPOOLED: direct },
      `DATABASE_URL=${pooled}\nDATABASE_URL_UNPOOLED=${direct}`,
    ),
    { url: isolated, runtime: isolated },
  );
});

test("missing test URL cannot fall back to a production direct URL", (t) => {
  assert.deepEqual(loadConfig(t, { NODE_ENV: "test", DATABASE_URL_UNPOOLED: direct }), {
    url: null,
    runtime: null,
  });
});

test("an explicitly empty direct URL does not silently fall back to another target", (t) => {
  assert.deepEqual(loadConfig(t, { DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: "" }), {
    url: "",
    runtime: pooled,
  });
});

test("schema-only generation stays possible without database credentials", (t) => {
  assert.deepEqual(loadConfig(t, {}), { url: null, runtime: null });
});
