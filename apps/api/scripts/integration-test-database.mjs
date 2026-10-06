import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { parseEnv } from "node:util";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sslModes = new Set(["disable", "prefer", "require", "verify-ca", "verify-full"]);

export function validateTestDatabaseUrl(value) {
  let url;
  let database;
  try {
    url = new URL(value);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    // Parser errors can contain credentials, so never surface their original text.
    throw new Error("Configure a valid PostgreSQL TEST_DATABASE_URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !/^[a-zA-Z0-9_]+_test$/.test(database) ||
    database.length > 63 ||
    url.hash
  ) {
    throw new Error("Integration tests require a dedicated PostgreSQL database ending in _test.");
  }

  const keys = new Set();
  for (const [key, parameter] of url.searchParams) {
    // libpq overrides must not redirect a URL whose pathname passed the test guard.
    if (
      keys.has(key) ||
      !(
        (key === "schema" && parameter === "public") ||
        (key === "sslmode" && sslModes.has(parameter))
      )
    ) {
      throw new Error("Test database URL parameters support only schema=public and sslmode.");
    }
    keys.add(key);
  }
  // Canonicalize the path so the existing per-suite _test guards see the same name.
  url.pathname = `/${database}`;
  return url.toString();
}

export function resolveIntegrationEnvironment(environment, testEnvContents = "") {
  const fileEnvironment = parseEnv(testEnvContents);
  if (environment.NODE_ENV === "production" || fileEnvironment.NODE_ENV === "production") {
    throw new Error("Integration database commands cannot run with NODE_ENV=production.");
  }

  // Never read .env; a legacy shell DATABASE_URL is accepted only after the same guard.
  const target =
    environment.TEST_DATABASE_URL ?? fileEnvironment.TEST_DATABASE_URL ?? environment.DATABASE_URL;
  if (target === undefined || target === "") {
    throw new Error("Set TEST_DATABASE_URL or create apps/api/.env.test from .env.test.example.");
  }
  const databaseUrl = validateTestDatabaseUrl(target);
  return {
    ...environment,
    NODE_ENV: "test",
    TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN: environment.WEB_ORIGIN ?? fileEnvironment.WEB_ORIGIN ?? "http://localhost:3000",
  };
}

function readTestEnvironment(directory) {
  try {
    return readFileSync(resolve(directory, ".env.test"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw new Error("Could not read apps/api/.env.test.");
  }
}

function pnpmCommand(environment, platform) {
  const cli = environment.npm_execpath;
  if (!cli) return { command: "pnpm", prefix: [] };
  if (/\.(?:c|m)?js$/i.test(cli)) return { command: process.execPath, prefix: [cli] };
  if (platform === "win32" && /\.(?:cmd|bat)$/i.test(cli)) {
    throw new Error(
      "Run integration database commands through pnpm with a Node or executable CLI.",
    );
  }
  return { command: cli, prefix: [] };
}

export function runIntegrationDatabase(
  mode,
  {
    environment = process.env,
    directory = apiDirectory,
    execute = spawnSync,
    platform = process.platform,
  } = {},
) {
  if (!["check", "prepare", "prepare-e2e", "run"].includes(mode)) {
    throw new Error("Use an integration database command: check, prepare, prepare-e2e or run.");
  }
  const childEnvironment = resolveIntegrationEnvironment(
    environment,
    readTestEnvironment(directory),
  );
  if (mode === "check") return 0;

  const pnpm = pnpmCommand(childEnvironment, platform);
  const commands = [];
  if (mode === "run" || mode === "prepare-e2e") {
    commands.push([pnpm.command, [...pnpm.prefix, "--filter", "@pulse-trade/contracts", "build"]]);
    commands.push([pnpm.command, [...pnpm.prefix, "build"]]);
  }
  // Deploy checked-in migrations only: never reset data or create a shadow database.
  commands.push([pnpm.command, [...pnpm.prefix, "db:deploy"]]);
  if (mode === "run") {
    commands.push([process.execPath, ["--test", "test/integration/*.test.mjs"]]);
  }

  for (const [command, args] of commands) {
    const result = execute(command, args, {
      cwd: directory,
      env: childEnvironment,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    if (result.error) {
      throw new Error("Could not start the integration database command. Check Node.js and pnpm.");
    }
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runIntegrationDatabase(process.argv[2]);
    if (process.argv[2] === "check") {
      process.stdout.write(
        "Dedicated integration database configuration is valid (connection not checked).\n",
      );
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
