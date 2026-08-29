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
      className="grid min-w-0 gap-3 lg:h-[calc(100dvh-13rem)] lg:grid-cols-[minmax(0,1.65fr)_minmax(22rem,1fr)]"
      data-trading-grid
    >
      <div className="contents lg:grid lg:min-h-0 lg:grid-rows-[minmax(0,1.65fr)_minmax(0,1fr)] lg:gap-3">
        <div className="order-1 min-h-0 min-w-0 [&>section]:h-full">{chart}</div>
        <div className="order-3 min-h-0 min-w-0 [&>section]:h-full">{recentTrades}</div>
      </div>
      <div className="contents lg:grid lg:min-h-0 lg:grid-rows-2 lg:gap-3">
        <div className="order-2 min-h-0 min-w-0 [&>section]:h-full">{orderBook}</div>
        <div className="order-4 min-h-0 min-w-0 [&>section]:h-full">{orderForm}</div>
      </div>
    </div>
  );
}
