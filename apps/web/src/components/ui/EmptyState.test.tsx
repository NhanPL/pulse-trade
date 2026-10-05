import Link from "next/link";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/ui/EmptyState";

describe("EmptyState", () => {
  it("renders a polite status with a heading, description and semantic action", () => {
    render(
      <EmptyState
        title="Your watchlist is empty."
        description="Save markets from Markets."
        action={<Link href="/">Explore Markets</Link>}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(
      within(status).getByRole("heading", { level: 2, name: "Your watchlist is empty." }),
    ).toBeVisible();
    expect(status).toHaveTextContent("Save markets from Markets.");
    expect(within(status).getByRole("link", { name: "Explore Markets" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("does not retain the previous render or invent an action when none is supplied", () => {
    render(<EmptyState title="No matching markets." />);
    expect(screen.getByRole("status")).toHaveTextContent("No matching markets.");
    expect(
      screen.queryByRole("heading", { name: "Your watchlist is empty." }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
