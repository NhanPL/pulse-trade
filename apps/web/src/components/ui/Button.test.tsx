import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/Button";

describe("Button", () => {
  beforeEach(() => {
    // Repeated renders also verify that the shared setup unmounts the previous test.
    expect(document.body).toBeEmptyDOMElement();
  });

  it("is a named, non-submitting button that supports keyboard activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Explore Markets</Button>);

    const button = screen.getByRole("button", { name: "Explore Markets" });
    expect(button).toHaveAttribute("type", "button");
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables activation while loading without hiding the action's name", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Button isLoading onClick={onClick}>
        Save market
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save market" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Button onClick={onClick}>Save market</Button>);
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("honors an explicitly disabled state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save market
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Save market" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
