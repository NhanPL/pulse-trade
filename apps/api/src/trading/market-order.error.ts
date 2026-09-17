export type MarketOrderErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "INVALID_QUANTITY"
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
