import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  resolveIntegrationEnvironment,
  runIntegrationDatabase,
  validateTestDatabaseUrl,
} from "../scripts/integration-test-database.mjs";

const testUrl =
  "postgresql://test_user:private_password@127.0.0.1:5433/pulse_trade_test?schema=public";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "pulse-trade-integration-config-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("test database URLs allow PostgreSQL, the public schema and explicit SSL mode", () => {
  for (const url of [
    testUrl,
    "postgres://localhost/another_test",
    `postgresql://localhost/${"a".repeat(58)}_test`,
    "postgresql://localhost/pulse_trade_test?schema=public&sslmode=disable",
  ]) {
    assert.equal(validateTestDatabaseUrl(url), url);
  }
  assert.equal(
    validateTestDatabaseUrl("postgresql://localhost/pulse_trade%5Ftest?sslmode=require"),
    "postgresql://localhost/pulse_trade_test?sslmode=require",
  );
});

for (const [reason, url] of [
  ["missing configuration", undefined],
  ["malformed URL", "private_password"],
  ["non-PostgreSQL protocol", "https://localhost/pulse_trade_test"],
  ["missing host", "postgresql:///pulse_trade_test"],
  ["development database", "postgresql://localhost/pulse_trade"],
  ["suffix followed by more text", "postgresql://localhost/pulse_trade_test_backup"],
  ["missing database", "postgresql://localhost/"],
  ["oversized database name", `postgresql://localhost/${"a".repeat(59)}_test`],
  ["multiple path segments", "postgresql://localhost/dev/pulse_trade_test"],
  ["encoded slash", "postgresql://localhost/dev%2Fpulse_trade_test"],
  ["invalid encoding", "postgresql://localhost/pulse_%ZZ_test"],
  ["fragment", "postgresql://localhost/pulse_trade_test#other"],
  ["database query override", "postgresql://localhost/pulse_trade_test?dbname=production"],
  ["database alias override", "postgresql://localhost/pulse_trade_test?database=production"],
  ["host query override", "postgresql://localhost/pulse_trade_test?host=production"],
  ["session options", "postgresql://localhost/pulse_trade_test?options=-csearch_path=private"],
  ["non-public schema", "postgresql://localhost/pulse_trade_test?schema=development"],
  ["duplicate schema", "postgresql://localhost/pulse_trade_test?schema=public&schema=public"],
  ["unsupported SSL mode", "postgresql://localhost/pulse_trade_test?sslmode=unexpected"],
]) {
  test(`test database URL rejects ${reason} without exposing credentials`, () => {
    assert.throws(
      () => validateTestDatabaseUrl(url),
      (error) => {
        assert.doesNotMatch(error.message, /private_password|postgresql:\/\//);
        return true;
      },
    );
  });
}

test("shell TEST_DATABASE_URL takes precedence and produces an isolated child environment", () => {
  const environment = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://localhost/development",
    TEST_DATABASE_URL: testUrl,
    WEB_ORIGIN: "http://localhost:4000",
    PATH: "preserved-tool-path",
  };
  const original = { ...environment };
  const resolved = resolveIntegrationEnvironment(
    environment,
    "TEST_DATABASE_URL=postgresql://localhost/file_test\nWEB_ORIGIN=http://localhost:3000",
  );
  assert.deepEqual(environment, original);
  assert.notEqual(resolved, environment);
  assert.equal(resolved.NODE_ENV, "test");
  assert.equal(resolved.DATABASE_URL, testUrl);
  assert.equal(resolved.TEST_DATABASE_URL, testUrl);
  assert.equal(resolved.WEB_ORIGIN, "http://localhost:4000");
  assert.equal(resolved.PATH, "preserved-tool-path");
});

test(".env.test target overrides a development shell URL without loading unrelated file secrets", () => {
  const resolved = resolveIntegrationEnvironment(
    { DATABASE_URL: "postgresql://localhost/development" },
    `NODE_ENV=test\nTEST_DATABASE_URL=${testUrl}\nWEB_ORIGIN=http://localhost:4000\nJWT_ACCESS_SECRET=unused`,
  );
  assert.equal(resolved.DATABASE_URL, testUrl);
  assert.equal(resolved.WEB_ORIGIN, "http://localhost:4000");
  assert.equal(resolved.JWT_ACCESS_SECRET, undefined);
});

test("legacy shell DATABASE_URL still requires a dedicated test target", () => {
  assert.equal(resolveIntegrationEnvironment({ DATABASE_URL: testUrl }).DATABASE_URL, testUrl);
  assert.throws(() =>
    resolveIntegrationEnvironment({ DATABASE_URL: "postgresql://localhost/dev" }),
  );
  assert.throws(() => resolveIntegrationEnvironment({}, `DATABASE_URL=${testUrl}`));
});

test("an explicitly empty test URL never falls back to another database", () => {
  assert.throws(() =>
    resolveIntegrationEnvironment({ TEST_DATABASE_URL: "", DATABASE_URL: testUrl }),
  );
  assert.throws(() =>
    resolveIntegrationEnvironment({ DATABASE_URL: testUrl }, "TEST_DATABASE_URL="),
  );
});

test("production environments are rejected even when the database has a test name", () => {
  assert.throws(() =>
    resolveIntegrationEnvironment({ NODE_ENV: "production", TEST_DATABASE_URL: testUrl }),
  );
  assert.throws(() =>
    resolveIntegrationEnvironment({ TEST_DATABASE_URL: testUrl }, "NODE_ENV=production"),
  );
});

test("check reads only .env.test, never the development .env, and starts no commands", (t) => {
  const directory = fixture(t);
  writeFileSync(join(directory, ".env"), `DATABASE_URL=${testUrl}\nNODE_ENV=production`);
  const execute = () => assert.fail("Configuration checks must not start a database command");
  assert.throws(() => runIntegrationDatabase("check", { directory, environment: {}, execute }));
  writeFileSync(join(directory, ".env.test"), `TEST_DATABASE_URL=${testUrl}`);
  assert.equal(runIntegrationDatabase("check", { directory, environment: {}, execute }), 0);
});

test("invalid targets fail before any migration, build or test child starts", (t) => {
  const directory = fixture(t);
  for (const mode of ["prepare", "run"]) {
    assert.throws(() =>
      runIntegrationDatabase(mode, {
        directory,
        environment: { TEST_DATABASE_URL: "postgresql://localhost/production" },
        execute: () => assert.fail("An unsafe target must never reach a child process"),
      }),
    );
  }
});

test("integration run builds, deploys migrations and tests with the same guarded target", (t) => {
  const directory = fixture(t);
  const calls = [];
  const environment = { TEST_DATABASE_URL: testUrl, npm_execpath: "/tools/pnpm.cjs" };
  const status = runIntegrationDatabase("run", {
    directory,
    environment,
    execute: (...args) => {
      calls.push(args);
      return { status: 0 };
    },
  });
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    [
      [process.execPath, ["/tools/pnpm.cjs", "--filter", "@pulse-trade/contracts", "build"]],
      [process.execPath, ["/tools/pnpm.cjs", "build"]],
      [process.execPath, ["/tools/pnpm.cjs", "db:deploy"]],
      [process.execPath, ["--test", "test/integration/*.test.mjs"]],
    ],
  );
  for (const [, args, options] of calls) {
    assert.equal(options.cwd, directory);
    assert.equal(options.env.DATABASE_URL, testUrl);
    assert.equal(options.env.TEST_DATABASE_URL, testUrl);
    assert.equal(options.env.NODE_ENV, "test");
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.equal(options.stdio, "inherit");
    assert.ok(!args.some((arg) => arg.includes("private_password")));
  }
  assert.equal(environment.DATABASE_URL, undefined);
});

test("prepare uses the pnpm executable on Windows and only deploys checked-in migrations", (t) => {
  const calls = [];
  assert.equal(
    runIntegrationDatabase("prepare", {
      directory: fixture(t),
      environment: { TEST_DATABASE_URL: testUrl, npm_execpath: "C:\\tools\\pnpm.exe" },
      platform: "win32",
      execute: (...args) => {
        calls.push(args);
        return { status: 0 };
      },
    }),
    0,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "C:\\tools\\pnpm.exe");
  assert.deepEqual(calls[0][1], ["db:deploy"]);
});

test("a failed build, migration or test stops the run and preserves its exit status", (t) => {
  const directory = fixture(t);
  for (const failureAt of [1, 2, 3, 4]) {
    let calls = 0;
    assert.equal(
      runIntegrationDatabase("run", {
        directory,
        environment: { TEST_DATABASE_URL: testUrl },
        execute: () => ({ status: ++calls === failureAt ? 7 : 0 }),
      }),
      7,
    );
    assert.equal(calls, failureAt);
  }
});

test("missing executables and terminated children fail rather than skipping integration tests", (t) => {
  const directory = fixture(t);
  const options = { directory, environment: { TEST_DATABASE_URL: testUrl } };
  assert.throws(
    () =>
      runIntegrationDatabase("prepare", {
        ...options,
        execute: () => ({ error: new Error(testUrl) }),
      }),
    (error) => !error.message.includes("private_password"),
  );
  assert.equal(
    runIntegrationDatabase("prepare", { ...options, execute: () => ({ status: null }) }),
    1,
  );
  assert.throws(() => runIntegrationDatabase("reset", options));
});
