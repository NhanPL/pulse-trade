import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RouteHeader } from "@/components/layout/RouteHeader";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthSessionProvider } from "@/features/auth/components/AuthSessionProvider";
import { RouteAuthBoundary } from "@/features/auth/components/ProtectedRoute";

import "./globals.css";

export const metadata: Metadata = {
  title: "PulseTrade",
  description: "Real-time crypto market data and paper trading.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthSessionProvider>
            <a
              className="sr-only z-50 rounded-lg bg-brand px-4 py-3 font-semibold text-foreground-inverse focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 focus:ring-offset-canvas"
              href="#main-content"
            >
              Skip to main content
            </a>
            <RouteHeader />
            <RouteAuthBoundary>{children}</RouteAuthBoundary>
          </AuthSessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
