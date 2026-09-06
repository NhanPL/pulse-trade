import type {
  OrderBookSnapshotEvent,
  OrderBookUpdateEvent,
  RealtimeEvent,
} from "@pulse-trade/contracts";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export const ORDER_BOOK_LEVEL_LIMIT = 20;
export const ORDER_BOOK_PRESENTATION_INTERVAL_MS = 50;

export type OrderBookLevel = Readonly<{
  price: string;
  quantity: string;
}>;

export type OrderBookStatus = "READY" | "RESYNC_REQUIRED";

export type OrderBookView = Readonly<{
  asks: readonly OrderBookLevel[];
  bids: readonly OrderBookLevel[];
  sequence: string;
  status: OrderBookStatus;
}>;

export type OrderBookStore = Readonly<{
  books: Readonly<Record<string, OrderBookView>>;
  applySnapshot(event: OrderBookSnapshotEvent): void;
  applyUpdate(event: OrderBookUpdateEvent): void;
  clearOrderBook(symbol: string): void;
}>;

export type RealtimeEventSource = Readonly<{
  onEvent(listener: (event: RealtimeEvent) => void): () => void;
}>;

type OrderBookChange = OrderBookUpdateEvent["data"]["changes"][number];
type OrderBookSide = "ASK" | "BID";

class OrderBookModel {
  private asks = new Map<string, string>();
  private bids = new Map<string, string>();
  private hasSnapshot = false;
  private sequence = "0";
  private status: OrderBookStatus = "RESYNC_REQUIRED";

  applySnapshot(event: OrderBookSnapshotEvent): void {
    this.asks = createLevelMap(event.data.asks);
    this.bids = createLevelMap(event.data.bids);
    this.hasSnapshot = true;
    this.sequence = event.data.sequence;
    this.status = "READY";
  }

  applyUpdate(event: OrderBookUpdateEvent): boolean {
    if (
      !this.hasSnapshot ||
      this.status !== "READY" ||
      !isNextSequence(this.sequence, event.data.sequence)
    ) {
      const didRequireResync = !this.hasSnapshot || this.status !== "RESYNC_REQUIRED";
      this.status = "RESYNC_REQUIRED";
      return didRequireResync;
    }

    for (const change of event.data.changes) {
      applyLevelChange(this.getSide(change.side), change);
    }

    this.sequence = event.data.sequence;
    return true;
  }

  toView(): OrderBookView {
    return {
      asks: deriveTopLevels(this.asks, "ASK"),
      bids: deriveTopLevels(this.bids, "BID"),
      sequence: this.sequence,
      status: this.status,
    };
  }

  private getSide(side: OrderBookSide): Map<string, string> {
    return side === "ASK" ? this.asks : this.bids;
  }
}

const modelsBySymbol = new Map<string, OrderBookModel>();
const pendingPresentationSymbols = new Set<string>();
let presentationTimer: ReturnType<typeof setTimeout> | undefined;

export const orderBookStore = createStore<OrderBookStore>((set) => ({
  books: {},
  applySnapshot: (event) => {
    const model = getOrCreateOrderBookModel(event.symbol);
    model.applySnapshot(event);
    schedulePresentation(event.symbol);
  },
  applyUpdate: (event) => {
    const model = getOrCreateOrderBookModel(event.symbol);
    if (model.applyUpdate(event)) schedulePresentation(event.symbol);
  },
  clearOrderBook: (symbol) => {
    modelsBySymbol.delete(symbol);
    pendingPresentationSymbols.delete(symbol);
    cancelPresentationTimerWhenIdle();

    set((currentState) => {
      if (!(symbol in currentState.books)) return currentState;

      const books = { ...currentState.books };
      delete books[symbol];
      return { books };
    });
  },
}));

export function selectOrderBook(symbol: string) {
  return (state: OrderBookStore): OrderBookView | undefined => state.books[symbol];
}

export function useOrderBook(symbol: string): OrderBookView | undefined {
  return useStore(orderBookStore, selectOrderBook(symbol));
}

export function bindOrderBookStore(source: RealtimeEventSource): () => void {
  return source.onEvent((event) => {
    if (event.event === "orderbook.snapshot") {
      orderBookStore.getState().applySnapshot(event);
      return;
    }

    if (event.event === "orderbook.update") {
      orderBookStore.getState().applyUpdate(event);
    }
  });
}

export function flushOrderBookPresentation(): void {
  if (presentationTimer !== undefined) {
    clearTimeout(presentationTimer);
    presentationTimer = undefined;
  }

  publishPendingPresentations();
}

function applyLevelChange(levels: Map<string, string>, change: OrderBookChange): void {
  if (isZeroDecimal(change.quantity)) {
    levels.delete(change.price);
    return;
  }

  levels.set(change.price, change.quantity);
}

function cancelPresentationTimerWhenIdle(): void {
  if (pendingPresentationSymbols.size !== 0 || presentationTimer === undefined) return;

  clearTimeout(presentationTimer);
  presentationTimer = undefined;
}

function createLevelMap(levels: readonly (readonly [string, string])[]): Map<string, string> {
  const levelMap = new Map<string, string>();

  for (const [price, quantity] of levels) {
    if (!isZeroDecimal(quantity)) levelMap.set(price, quantity);
  }

  return levelMap;
}

function deriveTopLevels(
  levels: ReadonlyMap<string, string>,
  side: OrderBookSide,
): OrderBookLevel[] {
  return [...levels]
    .sort(([leftPrice], [rightPrice]) => {
      const comparison = compareDecimalStrings(leftPrice, rightPrice);
      return side === "BID" ? -comparison : comparison;
    })
    .slice(0, ORDER_BOOK_LEVEL_LIMIT)
    .map(([price, quantity]) => ({ price, quantity }));
}

function getOrCreateOrderBookModel(symbol: string): OrderBookModel {
  const existingModel = modelsBySymbol.get(symbol);
  if (existingModel) return existingModel;

  const model = new OrderBookModel();
  modelsBySymbol.set(symbol, model);
  return model;
}

function isNextSequence(currentSequence: string, nextSequence: string): boolean {
  return BigInt(nextSequence) === BigInt(currentSequence) + BigInt(1);
}

function isZeroDecimal(value: string): boolean {
  return !/[1-9]/.test(value);
}

function compareDecimalStrings(left: string, right: string): number {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  const normalizedLeftInteger = leftInteger.replace(/^0+(?=\d)/, "");
  const normalizedRightInteger = rightInteger.replace(/^0+(?=\d)/, "");

  if (normalizedLeftInteger.length !== normalizedRightInteger.length) {
    return normalizedLeftInteger.length - normalizedRightInteger.length;
  }

  if (normalizedLeftInteger !== normalizedRightInteger) {
    return normalizedLeftInteger < normalizedRightInteger ? -1 : 1;
  }

  const fractionalLength = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeftFraction = leftFraction.padEnd(fractionalLength, "0");
  const normalizedRightFraction = rightFraction.padEnd(fractionalLength, "0");

  if (normalizedLeftFraction === normalizedRightFraction) return 0;
  return normalizedLeftFraction < normalizedRightFraction ? -1 : 1;
}

function publishPendingPresentations(): void {
  if (pendingPresentationSymbols.size === 0) return;

  const symbols = [...pendingPresentationSymbols];
  pendingPresentationSymbols.clear();

  orderBookStore.setState((currentState) => {
    const books = { ...currentState.books };

    for (const symbol of symbols) {
      const model = modelsBySymbol.get(symbol);
      if (model) books[symbol] = model.toView();
    }

    return { books };
  });
}

function schedulePresentation(symbol: string): void {
  pendingPresentationSymbols.add(symbol);
  if (presentationTimer !== undefined) return;

  // Every delta is ingested immediately; only sorted React-facing rows are capped at 20fps.
  presentationTimer = setTimeout(() => {
    presentationTimer = undefined;
    publishPendingPresentations();
  }, ORDER_BOOK_PRESENTATION_INTERVAL_MS);
}
