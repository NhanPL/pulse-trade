import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { BalancePanel } from "@/features/portfolio/components/BalancePanel";
import { HoldingsSection } from "@/features/portfolio/components/HoldingsSection";
import { PortfolioSummary } from "@/features/portfolio/components/PortfolioSummary";
import { CASH_BALANCE_PREVIEW } from "@/features/portfolio/model/cash-balance.mock";
import {
  HOLDING_PREVIEWS,
  HOLDING_PREVIEW_TOTALS,
} from "@/features/portfolio/model/holding-preview.mock";
import { PORTFOLIO_SUMMARY_PREVIEW } from "@/features/portfolio/model/portfolio-summary.mock";

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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge variant="neutral">Sample portfolio</Badge>
        <p className="text-sm text-foreground-muted">
          Illustrative values only. These are not your account balances.
        </p>
      </div>

      <PortfolioSummary values={PORTFOLIO_SUMMARY_PREVIEW} />
      <BalancePanel cash={CASH_BALANCE_PREVIEW} />
      <HoldingsSection holdings={HOLDING_PREVIEWS} totals={HOLDING_PREVIEW_TOTALS} />
    </PageContainer>
  );
}
