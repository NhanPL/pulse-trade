import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseEnv } from "node:util";

import { setupAuthEnvironment } from "../scripts/setup-auth-env.mjs";

function environmentFile(t, contents) {
  const directory = mkdtempSync(join(tmpdir(), "pulse-trade-auth-env-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, ".env");
  writeFileSync(path, contents);
  return path;
}

test("local auth setup persists a private random key once and preserves database configuration", (t) => {
  const original =
    "NODE_ENV=development\r\nDATABASE_URL=postgresql://localhost/local\r\n# JWT_ACCESS_SECRET=";
  const path = environmentFile(t, original);
  const message = setupAuthEnvironment(path, {});
  const first = readFileSync(path, "utf8");
  const configured = parseEnv(first);
  assert.match(configured.JWT_ACCESS_SECRET, /^[a-f0-9]{64}$/);
  assert.equal(first.startsWith(original), true);
  assert.equal(configured.DATABASE_URL, "postgresql://localhost/local");
  assert.equal(message.includes(configured.JWT_ACCESS_SECRET), false);

  setupAuthEnvironment(path, {});
  assert.equal(readFileSync(path, "utf8") === first, true);

  const other = environmentFile(t, "NODE_ENV=development\nJWT_ACCESS_SECRET=\n");
  setupAuthEnvironment(other, {});
  const otherSecret = parseEnv(readFileSync(other, "utf8")).JWT_ACCESS_SECRET;
  assert.match(otherSecret, /^[a-f0-9]{64}$/);
  assert.equal(otherSecret === configured.JWT_ACCESS_SECRET, false);
});

test("local auth setup respects runtime keys and refuses invalid keys without editing the file", (t) => {
  const path = environmentFile(t, "NODE_ENV=development\n");
  const original = readFileSync(path, "utf8");
  setupAuthEnvironment(path, { JWT_ACCESS_SECRET: "runtime-key-".repeat(4) });
  assert.equal(readFileSync(path, "utf8"), original);

  for (const JWT_ACCESS_SECRET of ["", "short"]) {
    assert.throws(() => setupAuthEnvironment(path, { JWT_ACCESS_SECRET }), /JWT_ACCESS_SECRET/);
    assert.equal(readFileSync(path, "utf8"), original);
  }
  const invalid = environmentFile(t, "JWT_ACCESS_SECRET=short\n");
  assert.throws(() => setupAuthEnvironment(invalid, {}), /at least 32/);
  assert.equal(readFileSync(invalid, "utf8"), "JWT_ACCESS_SECRET=short\n");
});

test("local auth setup never generates keys for production", (t) => {
  for (const [contents, environment] of [
    ["NODE_ENV=production\n", {}],
    ["NODE_ENV=development\n", { NODE_ENV: "production" }],
  ]) {
    const path = environmentFile(t, contents);
    assert.throws(() => setupAuthEnvironment(path, environment), /NODE_ENV=development/);
    assert.equal(readFileSync(path, "utf8"), contents);
  }
});
