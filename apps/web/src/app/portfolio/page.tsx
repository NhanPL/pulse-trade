import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/PageContainer";
import { PortfolioDashboard } from "@/features/portfolio/components/PortfolioDashboard";

export const metadata: Metadata = { title: "Portfolio | PulseTrade" };

// The protected-route boundary reads the request URL to preserve the sign-in destination.
export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <PageContainer className="max-w-[1586px] space-y-6" width="full">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Portfolio</h1>
        <p className="mt-2 text-base text-foreground-secondary">
          Track your paper trading performance and asset allocation.
        </p>
      </header>

      <PortfolioDashboard />
    </PageContainer>
  );
}
