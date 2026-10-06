import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

// Integration commands supply an isolated environment, never development secrets.
if (process.env.NODE_ENV !== "test" && existsSync(".env")) loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Schema validation and client generation do not require a running database.
  datasource: { url: process.env.DATABASE_URL },
});
