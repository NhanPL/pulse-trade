"use client";

import { useState, type ReactNode } from "react";

import { MobileRealtimeTabs, type MobileRealtimePanel } from "./MobileRealtimeTabs";

export type TradingGridProps = {
  chart: ReactNode;
  orderBook: ReactNode;
  orderForm: ReactNode;
  recentTrades: ReactNode;
};

export function TradingGrid({ chart, orderBook, orderForm, recentTrades }: TradingGridProps) {
  const [mobilePanel, setMobilePanel] = useState<MobileRealtimePanel>("order-book");

  return (
    <div
      className="grid min-w-0 gap-3 lg:h-[calc(100dvh-13rem)] lg:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]"
      data-trading-grid
    >
      <div className="contents lg:grid lg:min-h-0 lg:grid-rows-[minmax(0,1.65fr)_minmax(0,1fr)] lg:gap-3">
        <div className="order-1 min-h-0 min-w-0 [&>section]:h-full">{chart}</div>
        <div
          id="mobile-recent-trades-panel"
          className={
            mobilePanel === "recent-trades"
              ? "order-3 min-h-0 min-w-0 lg:block [&>section]:h-full"
              : "order-3 hidden min-h-0 min-w-0 lg:block [&>section]:h-full"
          }
        >
          {recentTrades}
        </div>
      </div>
      <div className="contents lg:grid lg:min-h-0 lg:grid-rows-2 lg:gap-3">
        <div
          id="mobile-order-book-panel"
          className={
            mobilePanel === "order-book"
              ? "order-3 min-h-0 min-w-0 lg:block [&>section]:h-full"
              : "order-3 hidden min-h-0 min-w-0 lg:block [&>section]:h-full"
          }
        >
          {orderBook}
        </div>
        <div className="order-4 min-h-0 min-w-0 [&>section]:h-full">{orderForm}</div>
      </div>
      <div className="order-2 lg:hidden">
        <MobileRealtimeTabs
          controlsByValue={{
            "order-book": "mobile-order-book-panel",
            "recent-trades": "mobile-recent-trades-panel",
          }}
          onValueChange={setMobilePanel}
          value={mobilePanel}
        />
      </div>
    </div>
  );
}
