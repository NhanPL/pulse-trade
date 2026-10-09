"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { reportFrontendError } from "@/lib/observability/browser-error-reporting";

export default function PageError({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  useEffect(() => {
    reportFrontendError("route_error", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6" id="main-content" tabIndex={-1}>
      <ErrorState
        description="Please try loading this page again. If you submitted an order, check its status before placing another."
        onRetry={reset}
        title="This page could not be displayed"
      />
    </main>
  );
}
