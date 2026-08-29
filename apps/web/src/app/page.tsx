import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { MarketOverview } from "@/features/market/components/MarketOverview";
import { MARKET_TABLE_MOCK } from "@/features/market/model/market-table.mock";

export default function HomePage() {
  return (
    <PageContainer className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
            Paper trading markets
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Market Overview</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Track curated USD crypto markets before placing simulated trades.
          </p>
        </div>
        <Badge showDot variant="neutral">
          Static preview
        </Badge>
      </div>

      <section
        aria-labelledby="market-list-heading"
        className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-panel"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <h2 id="market-list-heading" className="text-base font-semibold text-foreground">
              Crypto markets
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              Static values preview the upcoming live market feed.
            </p>
          </div>
        </div>
        <MarketOverview markets={MARKET_TABLE_MOCK} />
      </section>
    </PageContainer>
  );
}
