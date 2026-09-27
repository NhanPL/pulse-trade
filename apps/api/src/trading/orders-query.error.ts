export class OrdersQueryError extends Error {
  readonly code = "INVALID_CURSOR" as const;

  constructor(message: string) {
    super(message);
    this.name = "OrdersQueryError";
  }
}
