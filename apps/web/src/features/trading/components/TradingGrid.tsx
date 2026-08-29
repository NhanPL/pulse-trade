import type { ReactNode } from "react";

export type TradingGridProps = {
  chart: ReactNode;
  orderBook: ReactNode;
  orderForm: ReactNode;
  recentTrades: ReactNode;
};

export function TradingGrid({ chart, orderBook, orderForm, recentTrades }: TradingGridProps) {
  return (
    <div
      className="grid min-w-0 gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.8fr)_minmax(22rem,0.8fr)] lg:items-stretch"
      data-trading-grid
    >
      {chart}
      {orderBook}
      {recentTrades}
      {orderForm}
    </div>
  );
}
