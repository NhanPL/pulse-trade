import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const {
  watchlistAddResponseSchema,
  watchlistListResponseSchema,
} = require("@pulse-trade/contracts");
const { configureHttpApplication } = require("../../dist/config/http-application.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const { WatchlistModule } = require("../../dist/watchlist/watchlist.module.js");

test("watchlist API persists owner-scoped idempotent mutations on PostgreSQL", async (t) => {
  assert.ok(
    process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  const app = await NestFactory.create(WatchlistModule, { logger: false });
  const client = app.get(PrismaService).client;
  const emails = [0, 1, 2].map(() => `watchlist-${randomUUID()}@example.com`);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  t.after(async () => {
    try {
      await client.$transaction([
        client.walletBalance.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
      ]);
    } finally {
      await app.close();
      if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });
  configureHttpApplication(app, { nodeEnv: "test", port: 3001, webOrigin: origin });
  await app.listen(0, "127.0.0.1");
  const base = `${await app.getUrl()}/api/v1`;
  const authRequest = (path, body, token) =>
    globalThis.fetch(`${base}/auth/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  for (const email of emails.slice(0, 2)) {
    assert.equal(
      (await authRequest("register", { email, password: "watchlist-password" })).status,
      201,
    );
  }
  const login = async (email) => {
    const response = await authRequest("login", { email, password: "watchlist-password" });
    assert.equal(response.status, 200);
    return {
      data: (await response.json()).data,
      cookie: response.headers.get("set-cookie").split(";")[0],
    };
  };
  let primary = await login(emails[0]);
  const other = await login(emails[1]);
  const primaryId = primary.data.user.id;
  const otherId = other.data.user.id;
  const request = (method = "GET", path = "", body, token = primary.data.accessToken, cookie) =>
    globalThis.fetch(`${base}/watchlist${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const readItems = async (token = primary.data.accessToken, query = "") => {
    const response = await request("GET", query, undefined, token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    return watchlistListResponseSchema.parse(await response.json()).data.items;
  };

  await t.test(
    "requires live bearer authentication for every operation, not cookies or body identity",
    async () => {
      for (const token of [null, "invalid-access-token"]) {
        for (const [method, path, body] of [
          ["GET", "", undefined],
          ["POST", "", { symbol: "BTC-USD" }],
          ["DELETE", "/BTC-USD", undefined],
        ]) {
          const response = await request(method, path, body, token, primary.cookie);
          assert.equal(response.status, 401);
          assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
        }
      }
      assert.deepEqual(await readItems(), []);
    },
  );

  await t.test(
    "adds supported symbols, preserves duplicate identity and isolates different users",
    async () => {
      const first = await request("POST", "", { symbol: "BTC-USD" });
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("cache-control"), "no-store");
      const saved = watchlistAddResponseSchema.parse(await first.json());
      assert.equal(saved.data.symbol, "BTC-USD");
      const duplicate = await request("POST", "", { symbol: "BTC-USD" });
      assert.equal(duplicate.status, 200);
      assert.deepEqual(await duplicate.json(), saved);
      const foreign = await request("POST", "", { symbol: "BTC-USD" }, other.data.accessToken);
      assert.equal(foreign.status, 200);
      const otherSaved = watchlistAddResponseSchema.parse(await foreign.json());
      assert.notEqual(otherSaved.data.id, saved.data.id);
      assert.deepEqual(await readItems(primary.data.accessToken, `?userId=${otherId}`), [
        saved.data,
      ]);
      assert.deepEqual(await readItems(other.data.accessToken), [otherSaved.data]);
      assert.equal(
        await client.watchlistItem.count({ where: { userId: primaryId, symbol: "BTC-USD" } }),
        1,
      );
    },
  );

  await t.test(
    "rejects malformed bodies, injected owner fields and unsupported symbols without writes",
    async () => {
      const before = await readItems();
      for (const [body, code] of [
        [{}, "INVALID_WATCHLIST_REQUEST"],
        [{ symbol: "btc-usd" }, "INVALID_WATCHLIST_REQUEST"],
        [{ symbol: " BTC-USD " }, "INVALID_WATCHLIST_REQUEST"],
        [{ symbol: "BTC/USD" }, "INVALID_WATCHLIST_REQUEST"],
        [{ symbol: "BTC-USD", userId: otherId }, "INVALID_WATCHLIST_REQUEST"],
        [{ symbol: "DOGE-USD" }, "UNSUPPORTED_SYMBOL"],
      ]) {
        const response = await request("POST", "", body);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, code);
      }
      for (const [symbol, code] of [
        ["btc-usd", "INVALID_WATCHLIST_REQUEST"],
        ["DOGE-USD", "UNSUPPORTED_SYMBOL"],
      ]) {
        const response = await request("DELETE", `/${symbol}`);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, code);
      }
      assert.deepEqual(await readItems(), before);
    },
  );

  await t.test("concurrent repeated adds all succeed with exactly one persisted row", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => request("POST", "", { symbol: "XRP-USD" })),
    );
    const items = await Promise.all(
      responses.map(async (response) => {
        assert.equal(response.status, 200);
        return watchlistAddResponseSchema.parse(await response.json()).data;
      }),
    );
    for (const item of items) assert.deepEqual(item, items[0]);
    assert.equal(
      await client.watchlistItem.count({ where: { userId: primaryId, symbol: "XRP-USD" } }),
      1,
    );
  });

  await t.test(
    "lists newest first with a deterministic id tie-break and no private fields",
    async () => {
      assert.equal((await request("POST", "", { symbol: "ETH-USD" })).status, 200);
      await client.watchlistItem.updateMany({
        where: { userId: primaryId },
        data: { createdAt: new Date("2026-10-03T00:00:00.000Z") },
      });
      const expected = await client.watchlistItem.findMany({
        where: { userId: primaryId },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      const items = await readItems();
      assert.deepEqual(
        items.map((item) => item.id),
        expected.map((item) => item.id),
      );
      for (const item of items)
        assert.deepEqual(Object.keys(item).sort(), ["createdAt", "id", "symbol"]);
      await client.watchlistItem.updateMany({
        where: { userId: primaryId, symbol: "ETH-USD" },
        data: { createdAt: new Date("2026-10-03T01:00:00.000Z") },
      });
      assert.equal((await readItems())[0].symbol, "ETH-USD");
    },
  );

  await t.test(
    "database constraints enforce uniqueness, valid symbols and the owning user",
    async () => {
      await assert.rejects(
        client.watchlistItem.create({ data: { userId: primaryId, symbol: "BTC-USD" } }),
        (error) => error.code === "P2002",
      );
      await assert.rejects(
        client.watchlistItem.create({ data: { userId: randomUUID(), symbol: "SOL-USD" } }),
        (error) => error.code === "P2003",
      );
      await assert.rejects(
        client.watchlistItem.create({ data: { userId: primaryId, symbol: "btc-usd" } }),
      );
      assert.equal(
        await client.watchlistItem.count({ where: { userId: primaryId, symbol: "btc-usd" } }),
        0,
      );
      const user = await client.user.create({
        data: { email: emails[2], passwordHash: "unused-schema-test-password" },
      });
      await client.watchlistItem.create({ data: { userId: user.id, symbol: "SOL-USD" } });
      await client.user.delete({ where: { id: user.id } });
      assert.equal(await client.watchlistItem.count({ where: { userId: user.id } }), 0);
    },
  );

  await t.test(
    "logout revokes all watchlist access and relogin preserves saved markets",
    async () => {
      const saved = await readItems();
      const token = primary.data.accessToken;
      assert.equal((await authRequest("logout", {}, token)).status, 204);
      for (const [method, path, body] of [
        ["GET", "", undefined],
        ["POST", "", { symbol: "ADA-USD" }],
        ["DELETE", "/BTC-USD", undefined],
      ]) {
        const response = await request(method, path, body, token);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
      }
      primary = await login(emails[0]);
      assert.deepEqual(await readItems(), saved);
    },
  );

  await t.test(
    "concurrent and repeated removals are idempotent and never remove another user's symbol",
    async () => {
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => request("DELETE", `/BTC-USD?userId=${otherId}`)),
      );
      for (const response of responses) {
        assert.equal(response.status, 204);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(await response.text(), "");
      }
      assert.equal((await request("DELETE", "/SOL-USD")).status, 204);
      assert.equal(
        (await readItems()).some((item) => item.symbol === "BTC-USD"),
        false,
      );
      assert.equal((await readItems(other.data.accessToken))[0].symbol, "BTC-USD");
      for (const symbol of ["ETH-USD", "XRP-USD"])
        assert.equal((await request("DELETE", `/${symbol}`)).status, 204);
      assert.deepEqual(await readItems(), []);
    },
  );

  await t.test("watchlist operations do not change virtual funds or trading records", async () => {
    for (const userId of [primaryId, otherId]) {
      const wallet = await client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { userId, asset: "USD" } },
      });
      assert.equal(wallet.available.toString(), "10000");
      assert.equal(wallet.locked.toString(), "0");
      assert.equal(await client.walletBalance.count({ where: { userId } }), 1);
      assert.equal(await client.position.count({ where: { userId } }), 0);
      assert.equal(await client.order.count({ where: { userId } }), 0);
      assert.equal(await client.trade.count({ where: { userId } }), 0);
    }
  });
});
