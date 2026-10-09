"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { reportFrontendError } from "@/lib/observability/browser-error-reporting";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error; reset: () => void }>) {
  useEffect(() => {
    reportFrontendError("root_error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6" id="main-content">
          <ErrorState
            description="Please try again to reload the application."
            onRetry={reset}
            title="PulseTrade could not be displayed"
          />
        </main>
      </body>
    </html>
  );
}
