import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

/**
 * Loads the API package's local configuration before Nest creates providers.
 * Process-provided values keep precedence, so deployment secrets are never
 * replaced by a developer's `.env` file.
 */
export function loadRuntimeEnvironment(envPath = resolve(process.cwd(), ".env")): void {
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}
