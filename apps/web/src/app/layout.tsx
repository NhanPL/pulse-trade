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
            <RouteHeader />
            <RouteAuthBoundary>{children}</RouteAuthBoundary>
          </AuthSessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
