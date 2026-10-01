"use client";

import { useState } from "react";

import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/Tabs";

import { OpenOrdersTable } from "./OpenOrdersTable";
import { OrderHistoryTable } from "./OrderHistoryTable";

type OrdersTab = "open" | "history";

export function OrdersDashboard() {
  const [activeTab, setActiveTab] = useState<OrdersTab>("open");

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

      <TabPanel className="pt-5" value="open">
        {activeTab === "open" ? <OpenOrdersTable /> : null}
      </TabPanel>
      <TabPanel className="pt-5" value="history">
        {activeTab === "history" ? <OrderHistoryTable /> : null}
      </TabPanel>
    </Tabs>
  );
}
