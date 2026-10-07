import type { PortfolioResponse, OrderListItem } from "@pulse-trade/contracts";

export type O04DatabaseState = {
  userId: string;
  sessions: number;
  balances: PortfolioResponse["data"]["balances"];
  positions: PortfolioResponse["data"]["positions"];
  orders: Pick<
    OrderListItem,
    "id" | "symbol" | "side" | "type" | "status" | "quantity" | "filledQuantity" | "avgFillPrice"
  >[];
  trades: {
    orderId: string;
    side: "BUY" | "SELL";
    quantity: string;
    price: string;
    quoteAmount: string;
  }[];
};

export function startO04Server(): Promise<{
  email: string;
  close: () => Promise<void>;
  readState: () => Promise<O04DatabaseState>;
}>;
