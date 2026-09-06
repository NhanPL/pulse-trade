import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  bindOrderBookStore,
  flushOrderBookPresentation,
  orderBookStore,
  selectOrderBook,
} = require("../.next/realtime-test/features/realtime/stores/order-book-store.js");

class FakeRealtimeEventSource {
  listeners = new Set();

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function createSnapshotEvent({ asks = [], bids = [], sequence = "10", symbol = "BTC-USD" } = {}) {
  return {
    data: { asks, bids, sequence },
    event: "orderbook.snapshot",
    symbol,
    ts: 1_700_000_000_000,
    v: 1,
  };
}

function createUpdateEvent({ changes = [], sequence = "11", symbol = "BTC-USD" } = {}) {
  return {
    data: { changes, sequence },
    event: "orderbook.update",
    symbol,
    ts: 1_700_000_000_001,
    v: 1,
  };
}

function resetStore() {
  orderBookStore.getState().clearOrderBook("BTC-USD");
  orderBookStore.getState().clearOrderBook("ETH-USD");
  flushOrderBookPresentation();
}

test("applies snapshots into sorted top levels and omits zero quantities", () => {
  resetStore();
  const bids = Array.from({ length: 22 }, (_, index) => [String(100 - index), "1"]);
  orderBookStore.getState().applySnapshot(
    createSnapshotEvent({
      asks: [
        ["103", "1"],
        ["102", "2"],
        ["104", "0"],
      ],
      bids: [...bids, ["90", "0"]],
    }),
  );
  flushOrderBookPresentation();

  const book = selectOrderBook("BTC-USD")(orderBookStore.getState());
  assert.equal(book.status, "READY");
  assert.deepEqual(book.asks, [
    { price: "102", quantity: "2" },
    { price: "103", quantity: "1" },
  ]);
  assert.equal(book.bids.length, 20);
  assert.equal(book.bids[0].price, "100");
  assert.equal(book.bids.at(-1).price, "81");
  resetStore();
});

test("applies sequential deltas and removes levels with zero quantity", () => {
  resetStore();
  orderBookStore.getState().applySnapshot(
    createSnapshotEvent({
      asks: [["102", "2"]],
      bids: [["100", "1"]],
    }),
  );
  flushOrderBookPresentation();

  orderBookStore.getState().applyUpdate(
    createUpdateEvent({
      changes: [
        { price: "100", quantity: "3", side: "BID" },
        { price: "101", quantity: "2", side: "BID" },
        { price: "102", quantity: "0", side: "ASK" },
      ],
      sequence: "11",
    }),
  );
  flushOrderBookPresentation();

  const book = selectOrderBook("BTC-USD")(orderBookStore.getState());
  assert.equal(book.sequence, "11");
  assert.deepEqual(book.bids, [
    { price: "101", quantity: "2" },
    { price: "100", quantity: "3" },
  ]);
  assert.deepEqual(book.asks, []);
  resetStore();
});

test("requires a fresh snapshot after a sequence gap and preserves the last valid view", () => {
  resetStore();
  orderBookStore.getState().applyUpdate(
    createUpdateEvent({
      changes: [{ price: "99", quantity: "1", side: "BID" }],
      sequence: "1",
    }),
  );
  flushOrderBookPresentation();
  assert.deepEqual(selectOrderBook("BTC-USD")(orderBookStore.getState()), {
    asks: [],
    bids: [],
    sequence: "0",
    status: "RESYNC_REQUIRED",
  });

  orderBookStore
    .getState()
    .applySnapshot(createSnapshotEvent({ bids: [["100", "1"]], sequence: "10" }));
  flushOrderBookPresentation();

  orderBookStore.getState().applyUpdate(
    createUpdateEvent({
      changes: [{ price: "101", quantity: "2", side: "BID" }],
      sequence: "12",
    }),
  );
  flushOrderBookPresentation();
  const gappedBook = selectOrderBook("BTC-USD")(orderBookStore.getState());
  assert.equal(gappedBook.status, "RESYNC_REQUIRED");
  assert.deepEqual(gappedBook.bids, [{ price: "100", quantity: "1" }]);

  orderBookStore.getState().applyUpdate(
    createUpdateEvent({
      changes: [{ price: "102", quantity: "2", side: "BID" }],
      sequence: "13",
    }),
  );
  flushOrderBookPresentation();
  assert.deepEqual(selectOrderBook("BTC-USD")(orderBookStore.getState()).bids, [
    { price: "100", quantity: "1" },
  ]);

  orderBookStore
    .getState()
    .applySnapshot(createSnapshotEvent({ bids: [["103", "5"]], sequence: "20" }));
  flushOrderBookPresentation();
  const rebuiltBook = selectOrderBook("BTC-USD")(orderBookStore.getState());
  assert.equal(rebuiltBook.status, "READY");
  assert.deepEqual(rebuiltBook.bids, [{ price: "103", quantity: "5" }]);
  resetStore();
});

test("batches presentation updates while routing only order-book events and cleaning up", () => {
  resetStore();
  const source = new FakeRealtimeEventSource();
  const unbind = bindOrderBookStore(source);
  let presentationUpdates = 0;
  const unsubscribe = orderBookStore.subscribe(() => {
    presentationUpdates += 1;
  });

  source.emit({ event: "ticker.update" });
  source.emit(createSnapshotEvent({ bids: [["100", "1"]] }));
  source.emit(
    createUpdateEvent({
      changes: [{ price: "100", quantity: "2", side: "BID" }],
      sequence: "11",
    }),
  );
  assert.equal(presentationUpdates, 0);

  flushOrderBookPresentation();
  assert.equal(presentationUpdates, 1);
  assert.equal(selectOrderBook("BTC-USD")(orderBookStore.getState()).bids[0].quantity, "2");

  unbind();
  source.emit(createSnapshotEvent({ bids: [["200", "1"]], sequence: "20" }));
  flushOrderBookPresentation();
  assert.equal(selectOrderBook("BTC-USD")(orderBookStore.getState()).bids[0].price, "100");
  assert.equal(source.listeners.size, 0);
  unsubscribe();
  resetStore();
});
