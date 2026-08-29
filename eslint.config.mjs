import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

const webFiles = ["apps/web/**/*.{js,mjs,cjs,ts,tsx}"];

function scopeConfigs(configs, files) {
  return configs.map((config) => ({ ...config, files }));
}

export default defineConfig([
  globalIgnores([
    "**/.next/**",
    "**/dist/**",
    "**/node_modules/**",
    "**/*.tsbuildinfo",
    "pnpm-lock.yaml",
  ]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["*.{js,mjs,cjs}", "apps/api/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...scopeConfigs(nextVitals, webFiles),
  ...scopeConfigs(nextTypescript, webFiles),
  {
    files: webFiles,
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
  },
  prettier,
]);
