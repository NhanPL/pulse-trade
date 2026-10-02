"use client";

import { useState } from "react";

import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/Tabs";

import type { OrderFilters } from "../model/order-filters";
import { OpenOrdersTable } from "./OpenOrdersTable";
import { OrderHistoryTable } from "./OrderHistoryTable";
import { OrdersFilters } from "./OrdersFilters";

type OrdersTab = "open" | "history";

export function OrdersDashboard() {
  const [activeTab, setActiveTab] = useState<OrdersTab>("open");
  const [filters, setFilters] = useState<OrderFilters>({});
  const historyFilterKey = [filters.symbol, filters.side, filters.status].join(":");

  function resetVisibleFilters(): void {
    setFilters((current) => (activeTab === "open" ? { status: current.status } : {}));
  }

  return (
    <Tabs
      onValueChange={(value) => {
        if (value === "open" || value === "history") setActiveTab(value);
      }}
      value={activeTab}
    >
      <TabList aria-label="Order views">
        <Tab value="open">Open Orders</Tab>
        <Tab value="history">History</Tab>
      </TabList>

      <OrdersFilters
        activeTab={activeTab}
        filters={filters}
        onChange={setFilters}
        onReset={resetVisibleFilters}
      />

      <TabPanel className="pt-4" value="open">
        {activeTab === "open" ? (
          <OpenOrdersTable filters={{ side: filters.side, symbol: filters.symbol }} />
        ) : null}
      </TabPanel>
      <TabPanel className="pt-4" value="history">
        {activeTab === "history" ? (
          <OrderHistoryTable filters={filters} key={historyFilterKey} />
        ) : null}
      </TabPanel>
    </Tabs>
  );
}
