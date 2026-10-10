import { StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PageError from "@/app/error";
import GlobalError from "@/app/global-error";
import { reportFrontendError } from "@/lib/observability/browser-error-reporting";
import { FeatureErrorBoundary } from "./FeatureErrorBoundary";

vi.mock("@/lib/observability/browser-error-reporting", () => ({ reportFrontendError: vi.fn() }));

describe("P04 error recovery", () => {
  it("provides a standalone themed root fallback without exposing server-rendered error details", () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error("private-root-token")} reset={vi.fn()} />,
    );
    expect(markup).toContain('<html lang="en">');
    expect(markup).toContain("<body>");
    expect(markup).toContain("PulseTrade could not be displayed");
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("private-root-token");
    expect(reportFrontendError).not.toHaveBeenCalled();
  });

  it("isolates a failing chart, hides raw errors and supports keyboard retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("private-token");
    let failed = true;
    function Chart() {
      if (failed) throw error;
      return <p>Chart restored</p>;
    }
    render(
      <>
        <FeatureErrorBoundary
          reportKind="chart_error"
          retryLabel="Retry chart"
          title="Chart could not be displayed"
        >
          <Chart />
        </FeatureErrorBoundary>
        <button>Place paper order</button>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Chart could not be displayed");
    expect(screen.queryByText("private-token")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place paper order" })).toBeEnabled();
    expect(reportFrontendError).toHaveBeenCalledWith("chart_error", error);
    failed = false;
    screen.getByRole("button", { name: "Retry chart" }).focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(screen.getByText("Chart restored")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recovers a feature on route/timeframe key change", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error("private");
    }
    const { rerender } = render(
      <FeatureErrorBoundary resetKey="BTC:1m" reportKind="chart_error" title="Chart unavailable">
        <Broken />
      </FeatureErrorBoundary>,
    );
    rerender(
      <FeatureErrorBoundary resetKey="ETH:5m" reportKind="chart_error" title="Chart unavailable">
        <p>New market chart</p>
      </FeatureErrorBoundary>,
    );
    expect(screen.getByText("New market chart")).toBeInTheDocument();
  });

  it("reports route errors without rendering their message and invokes Next reset with the keyboard", async () => {
    const reset = vi.fn();
    const error = new Error("password=private");
    render(
      <StrictMode>
        <PageError error={error} reset={reset} />
      </StrictMode>,
    );
    expect(reportFrontendError).toHaveBeenCalledWith("route_error", error);
    expect(screen.queryByText("password=private")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
