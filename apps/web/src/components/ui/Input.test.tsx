import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";

describe("Input accessibility", () => {
  it("associates its visible label, hint, external description and validation error", async () => {
    const user = userEvent.setup();
    render(
      <>
        <p id="balance">Available USD: 10000.</p>
        <Input
          aria-describedby="balance"
          description="Use a positive amount."
          error="Quantity is required."
          label="Quantity"
          required
        />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Quantity*" });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Available USD: 10000. Use a positive amount. Quantity is required.",
    );
    await user.click(screen.getByText("Quantity", { exact: false, selector: "label" }));
    expect(input).toHaveFocus();
  });

  it("removes the obsolete error association without removing a persistent hint", () => {
    const { rerender } = render(
      <Input label="Email" description="Your account email." error="Enter a valid email." />,
    );
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAccessibleDescription("Your account email. Enter a valid email.");
    rerender(<Input label="Email" description="Your account email." />);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("Your account email.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
