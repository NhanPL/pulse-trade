import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs, Tab, TabList, TabPanel } from "./Tabs";

function Example({ vertical = false }) {
  const [value, setValue] = useState("open");
  return (
    <Tabs value={value} onValueChange={setValue} orientation={vertical ? "vertical" : "horizontal"}>
      <TabList aria-label="Order views">
        <Tab value="open">Open Orders</Tab>
        <Tab disabled value="disabled">
          Unavailable
        </Tab>
        <Tab value="history">History</Tab>
      </TabList>
      <TabPanel value="open">Pending orders</TabPanel>
      <TabPanel value="history">Completed orders</TabPanel>
    </Tabs>
  );
}

describe("Tabs accessibility", () => {
  it("roves focus and selection, wraps, and skips disabled tabs", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const open = screen.getByRole("tab", { name: "Open Orders" });
    const history = screen.getByRole("tab", { name: "History" });
    await user.tab();
    expect(open).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(open).toHaveAttribute("tabindex", "-1");
    const panel = screen.getByRole("tabpanel", { name: "History" });
    expect(history).toHaveAttribute("aria-controls", panel.id);
    await user.keyboard("{ArrowRight}");
    expect(open).toHaveFocus();
    await user.keyboard("{End}");
    expect(history).toHaveFocus();
    await user.keyboard("{Home}");
    expect(open).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("tabpanel", { name: "Open Orders" })).toHaveFocus();
  });

  it("uses the declared vertical arrow keys without capturing horizontal arrows", async () => {
    const user = userEvent.setup();
    render(<Example vertical />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Open Orders" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "Open Orders" })).toHaveFocus();
  });
});
