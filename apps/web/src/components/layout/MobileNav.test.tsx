import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileNav } from "./MobileNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Mobile navigation accessibility", () => {
  it("skips the pointer-only backdrop and restores trigger focus on Escape", async () => {
    const user = userEvent.setup();
    render(<MobileNav isAuthenticated />);
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    await user.tab();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute(
      "aria-controls",
      screen.getByRole("navigation", { name: "Primary navigation" }).id,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "Markets" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
