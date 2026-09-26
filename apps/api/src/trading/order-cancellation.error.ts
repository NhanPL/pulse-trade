export type OrderCancellationErrorCode = "ORDER_NOT_CANCELLABLE" | "ORDER_NOT_FOUND";

export class OrderCancellationError extends Error {
  constructor(
    readonly code: OrderCancellationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderCancellationError";
  }
}
