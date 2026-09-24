export type MarketOrderErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "INVALID_LIMIT_PRICE"
  | "INVALID_QUANTITY"
  | "MARKET_DATA_STALE"
  | "MARKET_DATA_UNAVAILABLE"
  | "ORDER_CONFLICT"
  | "UNSUPPORTED_SYMBOL";

export class MarketOrderError extends Error {
  constructor(
    readonly code: MarketOrderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MarketOrderError";
  }
}
