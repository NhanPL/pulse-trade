"use client";

import { useRef, useState } from "react";
import type { OrderListItem } from "@pulse-trade/contracts";

import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/Tabs";

import type { OrderFilters } from "../model/order-filters";
import { OpenOrdersTable } from "./OpenOrdersTable";
import { OrderHistoryTable } from "./OrderHistoryTable";
import { OrdersFilters } from "./OrdersFilters";
import { CancelOrderDialog } from "./CancelOrderDialog";

type OrdersTab = "open" | "history";

export function OrdersDashboard() {
  const [activeTab, setActiveTab] = useState<OrdersTab>("open");
  const [filters, setFilters] = useState<OrderFilters>({});
  const [selectedOrder, setSelectedOrder] = useState<OrderListItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const openTabRef = useRef<HTMLButtonElement>(null);
  const historyTabRef = useRef<HTMLButtonElement>(null);
  const historyFilterKey = [filters.symbol, filters.side, filters.status].join(":");

  function resetVisibleFilters(): void {
    setFilters((current) => (activeTab === "open" ? { status: current.status } : {}));
  }

  return (
    <>
      <Tabs
        onValueChange={(value) => {
          if (value === "open" || value === "history") setActiveTab(value);
        }}
        value={activeTab}
      >
        <TabList aria-label="Order views">
          <Tab ref={openTabRef} value="open">
            Open Orders
          </Tab>
          <Tab ref={historyTabRef} value="history">
            History
          </Tab>
        </TabList>

        <OrdersFilters
          activeTab={activeTab}
          filters={filters}
          onChange={setFilters}
          onReset={resetVisibleFilters}
        />
        {notice ? (
          <p className="mt-4 text-sm text-positive" role="status">
            {notice}
          </p>
        ) : null}

        <TabPanel className="pt-4" value="open">
          {activeTab === "open" ? (
            <OpenOrdersTable
              filters={{ side: filters.side, symbol: filters.symbol }}
              onCancel={(order) => {
                setNotice(null);
                setSelectedOrder(order);
              }}
            />
          ) : null}
        </TabPanel>
        <TabPanel className="pt-4" value="history">
          {activeTab === "history" ? (
            <OrderHistoryTable
              filters={filters}
              key={historyFilterKey}
              onCancel={(order) => {
                setNotice(null);
                setSelectedOrder(order);
              }}
            />
          ) : null}
        </TabPanel>
      </Tabs>
      {selectedOrder ? (
        <CancelOrderDialog
          key={selectedOrder.id}
          onDismiss={() => setSelectedOrder(null)}
          onSuccess={() => {
            setNotice(
              `${selectedOrder.symbol} ${selectedOrder.side} order cancelled. Reserved ${selectedOrder.side === "BUY" ? "funds" : "assets"} released.`,
            );
            setSelectedOrder(null);
          }}
          order={selectedOrder}
          returnFocusRef={activeTab === "open" ? openTabRef : historyTabRef}
        />
      ) : null}
    </>
  );
}
