import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export function setupAuthEnvironment(envPath, environment = process.env) {
  const contents = readFileSync(envPath, "utf8");
  const localEnvironment = parseEnv(contents);
  const mode = environment.NODE_ENV ?? localEnvironment.NODE_ENV ?? "development";
  if (mode !== "development") {
    throw new Error(
      "Local auth setup requires NODE_ENV=development. Configure deployment secrets separately.",
    );
  }

  const secret = environment.JWT_ACCESS_SECRET ?? localEnvironment.JWT_ACCESS_SECRET;
  if (secret) {
    if (secret.length < 32) {
      throw new Error(
        "JWT_ACCESS_SECRET must contain at least 32 characters. No configuration was changed.",
      );
    }
    return "JWT_ACCESS_SECRET is already configured; it was not changed.";
  }
  if (environment.JWT_ACCESS_SECRET !== undefined) {
    throw new Error(
      "Unset the empty JWT_ACCESS_SECRET in your shell before running local auth setup.",
    );
  }

  // Persist once so restarting the API does not invalidate existing access tokens.
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const separator = contents.endsWith("\n") || contents.length === 0 ? "" : newline;
  appendFileSync(
    envPath,
    `${separator}JWT_ACCESS_SECRET=${randomBytes(32).toString("hex")}${newline}`,
  );
  return "Configured a random JWT_ACCESS_SECRET in the local .env. Restart the API to use it.";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${setupAuthEnvironment(resolve(process.cwd(), ".env"))}\n`);
  } catch (error) {
    const message =
      error?.code === "ENOENT"
        ? "Create apps/api/.env from .env.example and configure DATABASE_URL before running auth:setup."
        : error.message;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
