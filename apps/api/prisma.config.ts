import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

// Integration commands supply an isolated environment, never development secrets.
if (process.env.NODE_ENV !== "test" && existsSync(".env")) loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Schema validation and client generation do not require a running database.
  datasource: {
    // Migration sessions bypass transaction pooling; tests must keep their guarded target.
    url:
      process.env.NODE_ENV === "test"
        ? process.env.DATABASE_URL
        : (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL),
  },
});
