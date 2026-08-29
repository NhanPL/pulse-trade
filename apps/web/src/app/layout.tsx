import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";

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
        <AppHeader authState="guest" />
        {children}
      </body>
    </html>
  );
}
